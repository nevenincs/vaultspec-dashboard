---
tags:
  - '#research'
  - '#windows-private-file-authority'
date: '2026-07-21'
modified: '2026-07-21'
related:
  - '[[2026-07-20-windows-private-file-authority-adr]]'
---

# `windows-private-file-authority` research: `ntfs directory durability`

This research grounds one gate: the `#[cfg(windows)]` branch of
`production_platform_gate()` in `vaultspec-distribution-authority`'s `lib.rs` currently
fails closed with `WindowsDatastoreAuthorityNotProvisioned`. Retiring that branch makes
a durability claim load-bearing for the TUF trust store's Windows datastore, so the
claim is examined here on its own terms, with citations and honest bounds, before any
retirement decision is made. This document does not gate implementation work, only the
platform-gate retirement.

## Question

`vaultspec-windows-authority`'s directory-hardening code (`os.rs`) opens directory
handles and, in one path, calls `FlushFileBuffers` on a directory handle rather than a
file handle. Two things must be established before that call can be trusted as a
durability primitive for a root of trust: what the call actually commits when the
target is a directory rather than a file, and whether the crate's ordering, flush the
child then flush the parent, is sufficient for a newly created or renamed child's
directory entry to survive a crash.

## Finding 1: What FlushFileBuffers commits on a directory handle, vs. a file handle

Documented. The public FlushFileBuffers reference does not special-case
directories; its remarks describe flushing "all the buffered information for a
specified file" to the device, note that unbuffered I/O
(FILE_FLAG_NO_BUFFERING | FILE_FLAG_WRITE_THROUGH) is an alternative for per-write
durability, and state that a volume handle flushes every open file on the volume.
Source: "FlushFileBuffers function (fileapi.h)", Microsoft Learn,
learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers.
Nothing on that page distinguishes file handles from directory handles; the
documentation is silent on the distinction, not permissive of it.

The kernel-level primitive underneath it, NtFlushBuffersFileEx, is more precise
and IS handle-kind-aware. Its Flags table states that the default 0 ("normal")
flush writes "file data and metadata in the file cache" and synchronizes the
underlying storage's own cache, with a support matrix per flag. Critically,
FLUSH_FLAGS_FILE_DATA_SYNC_ONLY is documented as not valid with volume or
directory handles, meaning the driver interface explicitly recognizes a directory
handle as a distinct flush target and reserves the data-only-sync flag for files.
The normal (0) flush path used by FlushFileBuffers carries no such exclusion in
that table. Source: "NtFlushBuffersFileEx function (ntifs.h)", Microsoft Learn,
learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntflushbuffersfileex.
That same page documents STATUS_ACCESS_DENIED as returned when the file lacks
write or append access, which matches the probe evidence in Finding 2 below
precisely: a directory handle lacking FILE_ADD_SUBDIRECTORY (the
directory-context spelling of the append-data right) is denied the flush.

Secondary but directly on point: the winntfs.com Windows storage-team
write-caching series states that starting with Windows 8, NTFS switched to using
the FlushFileBuffers API instead of depending upon the Forced Unit Access
behavior for its own metadata durability, and that FlushFileBuffers can be used to
flush all the outstanding data and metadata on a single file or a whole volume,
because at the file-system layer the mapping from cached pages to the owning file
(or directory) is known, so the flush can be scoped to exactly the metadata
belonging to that handle's file-system object. Source: "Windows Write Caching,
Part 2: An overview for Application Developers", winntfs.com,
winntfs.com/2012/11/29/windows-write-caching-part-2-an-overview-for-application-developers.
This source is Microsoft-storage-team-authored practitioner analysis, not an
official reference page, and is treated here as secondary corroboration rather
than primary documentation.

Conclusion for Finding 1: on a directory handle, the documented (kernel-level)
behavior of a normal flush is to write the directory object's own cached data and
metadata, that is, the directory's own B-tree/index content, not the file data of
its children, and to synchronize the underlying storage cache. This is
structurally the same operation FlushFileBuffers performs for a file handle
(flush this object's cached content and metadata), scoped to whatever file-system
object the handle names. The public FlushFileBuffers page does not itself state
this scoping for directories; the inference rests on the NtFlushBuffersFileEx flag
table and the winntfs.com practitioner explanation, not on one unified sentence of
official prose asserting it outright. That seam is flagged explicitly: it combines
a documented primitive (NtFlushBuffersFileEx) with a reasonable, source-grounded
inference about what "this object's metadata" means for a directory.

## Finding 2: Is the child's directory entry durable after flushing the child, the parent, or both?

Partially documented; partially inferred from probes. No Microsoft primary
source found in this research states directly, in one sentence, that flushing the
child's data and metadata and separately flushing the parent directory is what
makes the child's directory entry durable. The pieces are scattered:

- FlushFileBuffers on the CHILD's handle commits the child's own data and
  metadata (per Finding 1), making the child's file content and its own
  file-record ($FILE_NAME, $STANDARD_INFORMATION, etc.) durable, but says nothing
  about the PARENT's index page that names the child.
- The directory entry, the parent's B-tree index record mapping the child's name
  to its file reference, is metadata owned by the parent directory object, not
  the child. By the same reasoning as Finding 1, a flush scoped to the child's
  handle has no documented obligation to touch the parent's cached index pages.
  Committing the parent's directory entry therefore requires a flush on the
  parent's handle specifically.
- Cross-platform crash-consistency literature makes exactly this point about
  POSIX filesystems: fsync() on a file does not make its directory entry
  durable; the parent directory must be separately synced after
  rename()/creat(). Sources: the GitHub issue thread "Add fsync on parent
  directory after file creation and rename"
  (github.com/Telcoin-Association/telcoin-network/issues/551), and the general
  treatment at "Crash Consistency: fsync(), rename(), and Durability"
  (0xkiire.com/crash-consistency-fsync-rename). This is Linux/ext4-shaped
  literature, cited here as an analogous mechanism (data durability and
  directory-entry durability are governed by different metadata objects), not as
  a claim that NTFS behaves identically to ext4.
- One Windows-specific secondary source argues the opposite conclusion for the
  common case: Ayende Rahien's "fsync()-ing a directory on Linux (and not
  Windows)" (ayende.com/blog/202660-b/fsync-ing-a-directory-on-linux-and-not-windows)
  states plainly that on Windows, if the operation succeeds the file exists, and
  that the need to sync the parent directory (potentially all the way up the
  tree) applies only to Linux, not Windows. This claim is NOT backed by a cited
  primary source in that post; the author's own explanation for the difference is
  an appeal to "expected usage" (Windows incurring higher per-file-operation cost
  from AV/security filters vs. Linux's many-small-files workloads), not a
  technical mechanism. It is included here because it is a widely repeated claim
  in Windows-developer folklore, but it is explicitly downgraded to WEAK
  secondary evidence: it asserts a conclusion without grounding it in NTFS's
  actual journaling mechanism, and it does not address the specific crash window
  this ADR cares about (power loss between file-record commit and index-entry
  commit, or between an index-entry write-ahead-log record and its checkpoint).

Empirical evidence available (relayed from Opus-S11's probes per the task brief;
a request for the exact probe transcript, commands, and OS/filesystem build was
sent via SendMessage and had not returned a reply by the time this document was
authored, so it is reported here as relayed, not independently reproduced):

- FlushFileBuffers on a directory handle SUCCEEDS when the handle carries
  FILE_ADD_SUBDIRECTORY (0x0004), confirmed by Microsoft Learn's own
  access-rights table, which states FILE_ADD_SUBDIRECTORY (4) and
  FILE_APPEND_DATA (4) are the same bit reinterpreted per object kind: for a
  directory object, the right to create a subdirectory is FILE_ADD_SUBDIRECTORY.
  Source: "File Access Rights Constants (WinNT.h)", Microsoft Learn,
  learn.microsoft.com/en-us/windows/win32/fileio/file-access-rights-constants.
  The crate's own DIRECTORY_ACCESS mask in vaultspec-windows-authority/src/os.rs
  already includes FILE_ADD_SUBDIRECTORY, which is why its directory handles can
  flush successfully.
- The same call on a plain read-only backup-semantics handle (lacking that bit)
  fails with ERROR_ACCESS_DENIED (5), consistent with NtFlushBuffersFileEx's
  documented STATUS_ACCESS_DENIED condition cited in Finding 1.
- A cap-std Dir handle opened without FILE_ADD_SUBDIRECTORY also fails the same
  way, and was closed by reopening the retained handle to itself with flush
  rights.

These probe results establish the access-rights precondition for the flush call
to succeed at all on a directory handle. They do NOT, by themselves, establish
that a successful flush-the-parent call is what makes a child's newly created
directory entry crash-durable, that is the inference above, drawn from
Finding 1's scoping argument plus the cross-platform crash-consistency pattern.
This is the one point in the brief that documentation is genuinely silent on; it
is recorded here as INFERRED, not documented.

Conclusion for Finding 2: the crate's practice of flushing the child, then
separately flushing the parent, is the technically defensible pattern given (a)
the per-object metadata scoping implied by Finding 1 and (b) the cross-platform
crash-consistency literature's treatment of directory entries as parent-owned
metadata. It is NOT a pattern Microsoft states in so many words for NTFS. The
Ayende post is the one Windows-specific source claiming the parent-flush step is
unnecessary in practice, and its reasoning does not rise to the standard this ADR
needs (it cites no primary mechanism and does not address the specific ordering
question). The safer, cited position is: flush the child, then flush the parent,
and treat the parent flush as necessary rather than redundant.

## Finding 3: What $LogFile metadata journaling contributes independently of an explicit flush, and whether the journal itself requires a flush to be durable

Documented via secondary technical sources; no single Microsoft primary
reference walks through commit timing end-to-end. NTFS's $LogFile is a
write-ahead log: every metadata-affecting operation (including directory index
changes, a rename for example is logged as a combination of an old-entry
delete, $FILE_NAME attribute removal/insertion, and new-entry insert into the
parent's index) is written to the log BEFORE being applied to the live on-disk
structures. Log records carry both redo and undo data; redo data is written when
a transaction commits, undo data when it rolls back. Recovery replays an analysis
pass, then a redo pass, using logged Log Sequence Numbers (LSNs) to determine
which transactions were committed at crash time. Source: "How the $LogFile
works?", dfir.ru, dfir.ru/2019/02/16/how-the-logfile-works; corroborated by
general $LogFile/forensic summaries such as "Master File Table (MFT), NTFS,
$LogFile, and $UsnJrnl: Forensics" (mahmoud-shaker.gitbook.io).
This gives NTFS crash consistency independent of any application-level flush
call: if the system crashes mid-transaction, replay of $LogFile on remount
restores the volume to a consistent state (either the transaction's effects are
fully present or fully absent), which is a stronger and different guarantee than
durability of any one specific transaction. Consistency answers "will the volume
be internally coherent after a crash"; durability answers "will THIS PARTICULAR
write still be there after a crash." NTFS journaling by itself guarantees the
former unconditionally (subject to Finding 4's storage-honesty caveat); it does
NOT by itself guarantee the latter for any specific application-visible write,
because a log record that has only reached the in-memory log buffer, not yet
written to the physical $LogFile region on disk, can be lost exactly like any
other buffered write. The journal's own durability is subject to the identical
flush-and-storage-honesty chain as the volume's regular metadata: it is written
through the same cache manager, and the winntfs.com source's statement that NTFS
itself moved from FUA to FlushFileBuffers for its metadata durability strategy
under Windows 8+ applies to committing the journal, not just to the
"user-visible" metadata it protects.

Conclusion for Finding 3: $LogFile journaling contributes crash consistency of
NTFS's own on-disk structures independent of any application flush call, a
half-completed rename can never be observed as half-completed after a
crash-and-remount, because the replay is atomic per logged transaction. It does
NOT substitute for an explicit flush when the requirement is that a specific
write (e.g. this one child's creation) is guaranteed present rather than
possibly rolled back to its pre-crash state. The journal record for that
transaction must itself reach stable storage, which is exactly what
FlushFileBuffers/normal-flush forces; absent that flush, the transaction may not
yet be in the log at all at crash time, in which case replay has nothing to redo
and the operation is correctly (from NTFS's internal-consistency point of view)
treated as having never happened.

## Finding 4: The bound the claim cannot exceed, storage that does not honor the flush

Documented, and this is the load-bearing caveat. Both the flush and the journal
findings above assume the underlying storage device actually executes the
FLUSH_CACHE (or equivalent) command it is issued and does not silently
acknowledge it while still holding data in a volatile write cache. This
assumption does not universally hold:

- Prior to Windows 8, NTFS relied on the SCSI/ATA Force Unit Access (FUA) flag
  for its own metadata durability, but EIDE and SATA drivers do not respect the
  FUA flag, which means writes may still be buffered by the drive's internal
  memory, an acknowledged historical gap. Source: "Revised notes on the
  reliability of FlushFileBuffers", The Old New Thing,
  devblogs.microsoft.com/oldnewthing/20170510-00/?p=95505.
- Starting with Windows 8, Microsoft states it worked with drive vendors so that
  support for FLUSH_CACHE became required by all drives in order to be declared
  compatible with Windows 8, and NTFS itself switched from depending on FUA to
  issuing FlushFileBuffers-driven FLUSH_CACHE requests for its metadata (same Old
  New Thing source; corroborated by the winntfs.com source above). This raises
  the floor for Windows-8-and-later, WHQL-compatible, direct-attached storage,
  but it is a certification requirement on the drive, enforced through the
  Windows Hardware Compatibility Program, it is not a guarantee the OS can make
  about every device that can be attached to a Windows machine.
- The winntfs.com source is explicit that the underlying problem is broader than
  any one OS: the implementation of FUA in these devices is, at best,
  inconsistent, and even when implemented, the default is to turn it off, across
  ATA/IDE/ATAPI/SATA devices generally, creating a possibility of data corruption
  due to drives caching data, and notes the same class of problem affects other
  popular operating systems such as Apple OS X and Linux as well. This is a
  storage-hardware-class problem, not an NTFS-specific one.
- FlushFileBuffers's own reference page lists explicit support for SMB 3.0 (with
  and without Transparent Failover / Scale-Out File Shares), Cluster Shared
  Volume File System, and ReFS as of Windows 8/Server 2012. The fact that this
  support had to be called out and enumerated by technology implies the opposite
  is not universally assumed for arbitrary storage backends, virtualized disks,
  some network/remote filesystem implementations, and storage stacks outside
  this enumerated list are not covered by this statement, and their
  flush-honesty is not established by this research.
- The Old New Thing source also flags a related economic caveat, distinct from
  honesty of the flush itself: FlushFileBuffers is expensive and may not
  actually help you without transactional data structuring, and
  FILE_FLAG_WRITE_THROUGH provides no additional robustness on systems where
  SATA drivers ignore FUA flags, i.e. even the write-through alternative
  inherits the same hardware-honesty dependency, it does not sidestep it.

Conclusion for Finding 4, the honest bound: the durability guarantee this
document can support is CONDITIONAL, not unconditional: on Windows 8 or later,
over a storage stack that honors FLUSH_CACHE/FlushFileBuffers (which
WHQL-certified direct-attached drives are required to as of Windows 8, and which
the enumerated SMB 3.0/CSVFS/ReFS remote/cluster technologies are documented to
support), a successful FlushFileBuffers call commits the flushed object's cached
data and metadata to physical media. Outside that envelope, virtualized storage
of unknown provenance, non-WHQL or legacy devices, storage stacks not on the
enumerated support list, or any device that acknowledges FLUSH_CACHE without
actually committing to non-volatile media, the guarantee degrades to "the OS
believes it flushed" rather than "the bytes are on stable media." A durability
claim about the root of trust that overstates this bound is worse than one that
states it plainly; this document states it plainly and does not claim
unconditional durability.
## Finding 5: Does the sourced material support "contents durable before the name that publishes them"?

Partially supported. The file-then-directory half is well-grounded; the
rename-then-parent-flush half is grounded by the same inference as Finding 2,
not by a dedicated primary source.

- "Flush the file, then the containing directory" for a newly created file rests
  on the same per-object metadata scoping established in Finding 1: the file's
  own flush commits its content and file-record; the directory's own flush is a
  distinct, necessary act to commit the parent's index entry (Finding 2). Both
  steps are independently well-documented as flush semantics; their combination
  as a sufficient ordering rule for entry durability is the inferred part, not a
  single Microsoft sentence.
- "A directory's contents must be durable before any rename that makes it
  visible" generalizes the same reasoning one level: the object being made
  visible (a file or a directory subtree) must have its own content/metadata
  flushed before the rename operation that publishes it under a new,
  discoverable name, and the rename's own effect on the parent index similarly
  needs the parent flushed afterward. The $LogFile transaction-consistency
  finding (Finding 3) supports the safety of the rename step itself (the
  four-part rename transaction is atomic under crash-replay, it cannot be
  observed half-done), but atomicity of the rename transaction is a different
  property from durability of everything the rename now makes reachable; the two
  properties compose only if the contents were already durable when the rename
  transaction is journaled, which is exactly why the ordering rule requires the
  content flush to happen strictly before the rename.
- No source found here evaluates this exact composed ordering rule as a named
  pattern for NTFS specifically (the closest is the ext4/POSIX crash-consistency
  literature, which states the analogous rule for that filesystem family). This
  research treats the NTFS version of the rule as well-motivated by Findings 1-3
  and the crate's own probe evidence, but not as an independently documented
  NTFS best practice.

## Conclusion

Within its bound (Finding 4), a directory handle carrying FILE_ADD_SUBDIRECTORY
can be flushed with FlushFileBuffers, and, by the same object-scoped-metadata
reasoning documented for file handles and made handle-kind-explicit by
NtFlushBuffersFileEx's flag table, that flush commits the directory's own cached
data and metadata (its index/B-tree content) to storage that honors the flush. A
child's directory entry is therefore reasonably concluded to require both the
child's own flush (for its content/file-record) and a separate flush of the
parent handle (for the parent's index entry naming that child); this is the
documented half. The claim that this two-step sequence is sufficient for entry
durability is inferred from that scoping argument plus general
crash-consistency literature, not stated outright by a Microsoft primary source
for NTFS. $LogFile write-ahead journaling gives NTFS's own on-disk structures
crash consistency independent of any explicit application flush, but that
consistency guarantee is orthogonal to, and does not substitute for, durability
of any one specific transaction, the journal record for that transaction must
itself reach storage, via the same flush-and-honest-hardware chain as
everything else.

The claim this document supports, precisely bounded: on Windows 8 or later,
over storage that honors FLUSH_CACHE (WHQL-required for direct-attached drives
since Windows 8; documented for SMB 3.0/CSVFS/ReFS), flushing a newly-written
file's handle followed by flushing its containing directory's handle is
sufficient for that file's content and its directory entry to survive a crash;
the same two-step pattern (flush what changed, then flush the directory whose
index entry now references it) is the technically defensible ordering for a
rename that publishes a name. This claim does NOT hold over storage that
silently ignores flush requests, and the specific sufficiency of the two-flush
ordering for NTFS is an informed inference from documented per-object flush
scoping and general crash-consistency principles, not a directly cited
NTFS-specific guarantee.

## What remains unproven or environment-dependent

- No Microsoft primary source states, in one place, that flushing a directory
  handle commits that directory's own B-tree/index content. This is inferred
  from NtFlushBuffersFileEx's flag table treating directory handles as a
  distinct, supported flush target, plus winntfs.com's practitioner explanation
  of how NTFS scopes metadata flushes to a file-system object. It has not been
  confirmed against an authoritative NTFS internals reference (e.g. the
  "Windows Internals" book or an equivalent primary technical reference) in this
  pass.
- The claim that flushing child-then-parent is sufficient (not merely
  necessary) for directory-entry durability is not directly documented for
  NTFS; it rests on analogy to POSIX crash-consistency literature plus the
  scoping argument above. An authoritative NTFS-specific statement of this exact
  sufficiency claim was not found.
- This research did not independently re-run or verify the empirical probe
  transcripts referenced in the task brief (FlushFileBuffers success/failure by
  access mask, cap-std Dir handle behavior). A request for the exact commands,
  OS build, and file-system version tested was sent to the teammate holding
  those results (Opus-S11) via SendMessage and had not been answered at the
  time this document was authored; the probe results are reported here as
  relayed in the task brief, attributed to that teammate, not independently
  reproduced.
- No actual crash/power-loss experiment (e.g. a QEMU power-cut harness or
  equivalent) was performed or reviewed in this pass; all durability reasoning
  here is inference from documented API semantics and journaling architecture,
  not from an observed crash-and-recover cycle exercising this exact code path.
- The behavior of virtualized disks (Hyper-V VHDX, cloud block storage),
  network filesystems outside the FlushFileBuffers-enumerated
  SMB 3.0/CSVFS/ReFS list, and non-WHQL-certified or legacy storage remains
  genuinely unresolved by this research, Finding 4 states the bound but does
  not resolve which storage classes this project's actual deployment targets
  fall into.
- Whether Windows editions/builds newer than the sources cited (most dated
  2012-2018, with the NtFlushBuffersFileEx page dated 2024) have changed this
  behavior was not separately checked against current (2026) Windows
  documentation beyond confirming the pages above are still live and
  unretracted at fetch time.
