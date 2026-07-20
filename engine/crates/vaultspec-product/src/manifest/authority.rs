#![allow(
    dead_code,
    reason = "compile-time sealed verification substrate awaits a production adapter authority"
)]

use super::*;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CohortDescriptor {
    schema_version: String,
    id: String,
    digest_algorithm: String,
    members: Vec<CohortMember>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CohortMember {
    target: Target,
    member_manifest_digest: String,
}

fn parse_cohort(raw: &[u8]) -> Result<CohortDescriptor> {
    require_input_bound("cohort descriptor", raw.len(), MAX_COHORT_BYTES as u64)?;
    let descriptor: CohortDescriptor =
        serde_json::from_slice(raw).map_err(|error| ManifestError::Parse(error.to_string()))?;
    expect_literal(
        "cohort.schema_version",
        COHORT_SCHEMA_VERSION,
        &descriptor.schema_version,
    )?;
    require_identity("cohort.id", &descriptor.id)?;
    expect_literal(
        "cohort.digest_algorithm",
        DIGEST_ALGORITHM,
        &descriptor.digest_algorithm,
    )?;
    if descriptor.members.len() != TARGETS.len() {
        return invalid("cohort.members", "must contain exactly five members");
    }
    for (index, (member, target)) in descriptor.members.iter().zip(TARGETS).enumerate() {
        if member.target != target {
            return invalid(
                &format!("cohort.members[{index}].target"),
                "members must use canonical five-target order",
            );
        }
        require_digest(
            &format!("cohort.members[{index}].member_manifest_digest"),
            &member.member_manifest_digest,
        )?;
    }
    Ok(descriptor)
}

/// Validate an external cohort descriptor and return the SHA-256 of its exact
/// RFC 8785 JCS UTF-8 representation.
///
/// This computes a candidate descriptor's identity; it does not make that
/// identity trusted. Verification authority must come from an independently
/// supplied expected cohort digest (for example release publication metadata).
#[cfg(test)]
pub(super) fn cohort_descriptor_digest(raw: &[u8]) -> Result<String> {
    let descriptor = parse_cohort(raw)?;
    Ok(sha256_hex(&canonical_cohort_bytes(&descriptor)))
}

fn canonical_cohort_bytes(descriptor: &CohortDescriptor) -> Vec<u8> {
    // All accepted strings use ASCII-only closed grammars. Therefore sorting
    // object keys lexicographically and emitting the strings without escapes is
    // exactly RFC 8785 JCS for this fixed descriptor (no numbers are present).
    let mut body = format!(
        "{{\"digest_algorithm\":\"sha256\",\"id\":\"{}\",\"members\":[",
        descriptor.id
    );
    for (index, member) in descriptor.members.iter().enumerate() {
        if index != 0 {
            body.push(',');
        }
        body.push_str(&format!(
            "{{\"member_manifest_digest\":\"{}\",\"target\":\"{}\"}}",
            member.member_manifest_digest,
            member.target.triple()
        ));
    }
    body.push_str("],\"schema_version\":\"1.0\"}");
    body.into_bytes()
}

// ---------------------------------------------------------------------------
// Complete installed-byte verification
// ---------------------------------------------------------------------------

impl ReceiptActivationContext {
    fn validate(&self) -> Result<()> {
        if self.created_ms <= 0 {
            return invalid("receipt.created_ms", "must be positive");
        }
        if let Some(prior) = &self.prior_seat {
            crate::paths::validate_generation(&prior.generation).map_err(|error| {
                ManifestError::InvalidField {
                    field: "receipt.prior_seat.generation".to_string(),
                    detail: error.to_string(),
                }
            })?;
            require_exact_version(
                "receipt.prior_seat.dashboard_version",
                &prior.dashboard_version,
            )?;
            if prior.pid == Some(0) {
                return invalid("receipt.prior_seat.pid", "must be non-zero when present");
            }
        }
        Ok(())
    }
}

impl VerifiedReceiptFacts {
    #[must_use]
    pub fn dashboard_version(&self) -> &str {
        &self.dashboard_version
    }

    #[must_use]
    pub fn dashboard_commit(&self) -> &str {
        &self.dashboard_commit
    }

    #[must_use]
    pub fn dashboard_digest(&self) -> &str {
        &self.dashboard_digest
    }

    #[must_use]
    pub fn release_set_identity(&self) -> &str {
        &self.release_set_identity
    }

    #[must_use]
    pub fn release_set_member_digest(&self) -> &str {
        &self.release_set_member_digest
    }

    #[must_use]
    pub fn component_lock_digest(&self) -> &str {
        &self.component_lock_digest
    }

    #[must_use]
    pub fn external_five_member_cohort_digest(&self) -> &str {
        &self.external_five_member_cohort_digest
    }

    #[must_use]
    pub const fn target(&self) -> Target {
        self.target
    }

    #[must_use]
    pub fn a2a_identity(&self) -> &ReleaseIdentity {
        &self.a2a_identity
    }

    #[must_use]
    pub fn active_generation(&self) -> &str {
        &self.active_generation
    }

    #[must_use]
    pub const fn channel(&self) -> Channel {
        self.channel
    }

    #[must_use]
    pub const fn bootstrap_created_ownership(&self) -> bool {
        self.bootstrap_created_ownership
    }

    #[must_use]
    pub fn prior_seat(&self) -> Option<&PriorSeatIdentity> {
        self.prior_seat.as_ref()
    }

    #[must_use]
    pub const fn consistency_generation(&self) -> u64 {
        self.consistency_generation
    }

    #[must_use]
    pub const fn created_ms(&self) -> i64 {
        self.created_ms
    }
}

impl<'generation, 'product, 'lock> VerifiedReleaseSet<'generation, 'product, 'lock> {
    /// Verify every trust, byte, authority, and receipt-fact join.
    ///
    /// The member manifest is found only by its externally trusted digest in a
    /// complete first scan. Candidate-declared path data participates only
    /// after those exact bytes have been located and bounded-reread.
    pub(super) fn verify(
        generation: &'generation mut UnpublishedGeneration<'product, 'lock>,
        input: ReleaseVerificationInput<'_>,
        receipt_context: ReceiptActivationContext,
    ) -> Result<Self> {
        let authority = input.authority;
        generation.validate_retained()?;
        receipt_context.validate()?;
        require_input_bound(
            "component lock",
            authority.trusted_component_lock_bytes.len(),
            MAX_COMPONENT_LOCK_BYTES as u64,
        )?;
        require_input_bound(
            "cohort descriptor",
            input.cohort_descriptor_bytes.len(),
            MAX_COHORT_BYTES as u64,
        )?;
        require_digest(
            "expected_member_manifest_digest",
            &authority.expected_member_manifest_digest,
        )?;
        require_digest("expected_cohort_digest", &authority.expected_cohort_digest)?;
        require_digest(
            "receipt_external_cohort_digest",
            &authority.receipt_external_cohort_digest,
        )?;
        require_digest(
            "expected_component_lock_digest",
            &authority.expected_component_lock_digest,
        )?;
        expect_literal(
            "trusted_component_lock_path",
            COMPONENT_LOCK_PATH,
            &authority.trusted_component_lock_path,
        )?;
        validate_portable_path("trusted_capsule_root", &authority.trusted_capsule_root)?;

        generation.validate_retained()?;
        let (initial_snapshot, member_manifest_path) = scan_generation_locating_member(
            generation.path(),
            &authority.expected_member_manifest_digest,
        )?;
        let located_member_bytes = read_installed_bounded(
            generation.path(),
            &member_manifest_path,
            MAX_MEMBER_MANIFEST_BYTES as u64,
            observed_file(&initial_snapshot.files, &member_manifest_path)?,
        )?;
        let member_digest = sha256_hex(&located_member_bytes);
        let manifest = parse_release(&located_member_bytes)?;
        expect_literal(
            "release_manifest.path",
            &member_manifest_path,
            &manifest.release_manifest.path,
        )?;
        if manifest.target != authority.expected_target {
            return Err(ManifestError::TargetMismatch {
                expected: authority.expected_target,
                found: manifest.target,
            });
        }

        let component_lock_digest = sha256_hex(&authority.trusted_component_lock_bytes);
        expect_digest(
            "trusted_component_lock_bytes",
            &authority.expected_component_lock_digest,
            &component_lock_digest,
        )?;
        let lock = parse_component_lock(&authority.trusted_component_lock_bytes)?;
        expect_literal(
            "a2a_component.component_lock.path",
            &authority.trusted_component_lock_path,
            &manifest.a2a_component.component_lock.path,
        )?;
        expect_digest(
            "a2a_component.component_lock.digest",
            &component_lock_digest,
            &manifest.a2a_component.component_lock.digest,
        )?;
        verify_release_lock_joins(&manifest, &lock)?;

        let cohort = parse_cohort(input.cohort_descriptor_bytes)?;
        let cohort_digest = sha256_hex(&canonical_cohort_bytes(&cohort));
        expect_digest(
            "cohort descriptor",
            &authority.expected_cohort_digest,
            &cohort_digest,
        )?;
        expect_literal("release cohort id", &cohort.id, &manifest.cohort.id)?;
        let member = cohort
            .members
            .iter()
            .find(|member| member.target == authority.expected_target)
            .ok_or_else(|| ManifestError::InvalidField {
                field: "cohort.members".to_string(),
                detail: format!(
                    "missing canonical member {}",
                    authority.expected_target.triple()
                ),
            })?;
        expect_digest(
            "cohort current member digest",
            &member_digest,
            &member.member_manifest_digest,
        )?;

        let observed = &initial_snapshot.files;
        verify_release_manifest_bytes(
            generation.path(),
            &manifest.release_manifest.path,
            &located_member_bytes,
            observed,
        )?;
        verify_complete_inventory(&manifest, observed)?;
        verify_installed_exact_bytes(
            generation.path(),
            &authority.trusted_component_lock_path,
            &authority.trusted_component_lock_bytes,
            observed_file(observed, &authority.trusted_component_lock_path)?,
        )?;

        verify_artifact_joins(&manifest, observed)?;
        let capsule_bytes = read_installed_bounded(
            generation.path(),
            &manifest.a2a_component.capsule_manifest.path,
            MAX_CAPSULE_MANIFEST_BYTES,
            observed_file(observed, &manifest.a2a_component.capsule_manifest.path)?,
        )?;
        let (capsule, _) = parse_capsule(&capsule_bytes)?;
        capsule.verify_against_lock(&lock, authority.expected_target)?;
        expect_literal(
            "protocol gateway minimum",
            &capsule.compatibility.api_versions.minimum,
            &manifest.protocol.gateway_api_version_range.minimum,
        )?;
        expect_literal(
            "protocol gateway maximum",
            &capsule.compatibility.api_versions.maximum,
            &manifest.protocol.gateway_api_version_range.maximum,
        )?;
        expect_literal(
            "state migration minimum",
            &capsule.compatibility.migration_range.base,
            &manifest.state_schema.migration_range.minimum,
        )?;
        expect_literal(
            "state migration maximum",
            &capsule.compatibility.migration_range.head,
            &manifest.state_schema.migration_range.maximum,
        )?;
        verify_tree_evidence(
            generation.path(),
            &authority.trusted_capsule_root,
            &manifest,
            &capsule,
            observed,
        )?;

        let final_snapshot = scan_generation(
            generation.path(),
            Some(manifest.release_manifest.path.as_str()),
        )?;
        generation.validate_retained()?;
        require_unchanged_snapshot(&initial_snapshot, &final_snapshot)?;

        let ReceiptActivationContext {
            channel,
            bootstrap_created_ownership,
            prior_seat,
            consistency_generation,
            created_ms,
        } = receipt_context;
        let active_generation = generation.generation().to_string();
        Ok(Self {
            generation,
            receipt_facts: VerifiedReceiptFacts {
                dashboard_version: manifest.dashboard.version,
                dashboard_commit: manifest.dashboard.commit,
                dashboard_digest: manifest.dashboard.digest,
                release_set_identity: manifest.cohort.id,
                release_set_member_digest: member_digest,
                component_lock_digest,
                external_five_member_cohort_digest: authority
                    .receipt_external_cohort_digest
                    .clone(),
                target: manifest.target,
                a2a_identity: manifest.a2a_component.release_identity,
                active_generation,
                channel,
                bootstrap_created_ownership,
                prior_seat,
                consistency_generation,
                created_ms,
            },
            member_manifest_path,
            final_snapshot,
            capsule_root: authority.trusted_capsule_root.clone(),
            capsule_manifest: capsule,
        })
    }

    /// Revalidate the exact retained authority and complete final snapshot at
    /// the activation boundary.
    pub fn revalidate_for_activation(&self) -> Result<()> {
        self.generation.validate_retained()?;
        let current = scan_generation(
            self.generation.path(),
            Some(self.member_manifest_path.as_str()),
        )?;
        self.generation.validate_retained()?;
        require_unchanged_snapshot(&self.final_snapshot, &current)
    }

    /// Immutable receipt facts retained under the exact generation borrow.
    #[must_use]
    pub fn receipt_facts(&self) -> &VerifiedReceiptFacts {
        &self.receipt_facts
    }

    /// Product paths derived from the exact retained generation token.
    ///
    /// This sealed seam exists only for fixed-journal publication. Receipt
    /// code cannot substitute a separately supplied product root.
    #[must_use]
    pub(crate) fn activation_paths(&self) -> &crate::paths::ProductPaths {
        self.generation.product_paths()
    }

    /// Installation guard joined to the exact retained generation token.
    ///
    /// This sealed seam exists only for fixed-journal publication. Receipt
    /// code cannot substitute a separately supplied lock authority.
    #[must_use]
    pub(crate) fn activation_guard(&self) -> &crate::locking::InstallLockGuard {
        self.generation.install_guard()
    }

    /// Synchronize the exact retained Unix app-home directory after a
    /// same-directory first-journal rename.
    #[cfg(unix)]
    pub(crate) fn synchronize_activation_app_home(&self) -> Result<()> {
        self.generation
            .synchronize_app_home()
            .map_err(ManifestError::from)
    }

    #[cfg(unix)]
    pub(crate) fn create_activation_init_file(
        &self,
        name: &std::ffi::OsStr,
    ) -> Result<std::fs::File> {
        self.generation
            .create_activation_init_file(name)
            .map_err(ManifestError::from)
    }

    #[cfg(unix)]
    pub(crate) fn install_activation_init_file(
        &self,
        source_name: &std::ffi::OsStr,
        destination_name: &std::ffi::OsStr,
    ) -> Result<()> {
        self.generation
            .install_activation_init_file(source_name, destination_name)
            .map_err(ManifestError::from)
    }

    /// Move the exact retained Windows app-home authority through S171.
    #[cfg(windows)]
    pub(crate) fn install_synchronized_activation_file(
        &mut self,
        source_name: &std::ffi::OsStr,
        destination_name: &std::ffi::OsStr,
    ) -> crate::generation::AppHomeInstallOutcome {
        self.generation
            .install_synchronized_app_home_file(source_name, destination_name)
    }

    /// Retry recovery of the exact app-home transition authority retained by
    /// this verified set after an indeterminate S171 outcome.
    #[cfg(windows)]
    pub(crate) fn recover_activation_app_home(&mut self) -> Result<()> {
        self.generation
            .recover_app_home_authority()
            .map_err(ManifestError::from)
    }

    #[must_use]
    pub const fn target(&self) -> Target {
        self.receipt_facts.target
    }

    #[must_use]
    pub fn release_set_id(&self) -> &str {
        &self.receipt_facts.release_set_identity
    }

    /// Diagnostic identifier borrowed from the exact retained token.
    #[must_use]
    pub fn generation_id(&self) -> &str {
        self.generation.generation()
    }

    #[must_use]
    pub fn member_manifest_digest(&self) -> &str {
        &self.receipt_facts.release_set_member_digest
    }

    #[must_use]
    pub fn component_lock_digest(&self) -> &str {
        &self.receipt_facts.component_lock_digest
    }

    #[must_use]
    pub fn cohort_digest(&self) -> &str {
        &self.receipt_facts.external_five_member_cohort_digest
    }

    #[must_use]
    pub fn dashboard_version(&self) -> &str {
        &self.receipt_facts.dashboard_version
    }

    #[must_use]
    pub fn dashboard_commit(&self) -> &str {
        &self.receipt_facts.dashboard_commit
    }

    #[must_use]
    pub fn dashboard_digest(&self) -> &str {
        &self.receipt_facts.dashboard_digest
    }

    #[must_use]
    pub fn a2a_identity(&self) -> &ReleaseIdentity {
        &self.receipt_facts.a2a_identity
    }

    #[must_use]
    pub fn capsule_root(&self) -> &str {
        &self.capsule_root
    }

    #[must_use]
    pub fn capsule_manifest(&self) -> &CapsuleManifest {
        &self.capsule_manifest
    }
}
