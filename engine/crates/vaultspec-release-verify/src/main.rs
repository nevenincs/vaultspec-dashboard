//! Status-only command wrapper around the linked distribution authority.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use vaultspec_distribution_authority::{
    DistributionTarget, VerificationRequest, verify_distribution,
};

const MAX_ARGUMENT_BYTES: usize = 4096;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let _ = run().await;
    // This leaf cannot claim success until the product provisioning consumer
    // is linked into the same process and consumes the opaque authority.
    eprintln!("REFUSED");
    std::process::exit(2);
}

async fn run() -> Result<(), ()> {
    let arguments = parse_arguments(std::env::args_os().skip(1))?;
    let target = arguments
        .target
        .to_str()
        .ok_or(())
        .and_then(|value| DistributionTarget::parse(value).map_err(|_| ()))?;
    let product_root = Path::new(&arguments.product_root);
    let request = VerificationRequest::for_product_root(
        PathBuf::from(arguments.bundle),
        product_root,
        target,
    )
    .map_err(|_| ())?;
    let authority = verify_distribution(request).await.map_err(|_| ())?;
    drop(authority);
    Err(())
}

struct Arguments {
    bundle: OsString,
    product_root: OsString,
    target: OsString,
}

fn parse_arguments(mut arguments: impl Iterator<Item = OsString>) -> Result<Arguments, ()> {
    expect_flag(arguments.next(), OsStr::new("--bundle"))?;
    let bundle = bounded_value(arguments.next())?;
    expect_flag(arguments.next(), OsStr::new("--product-root"))?;
    let product_root = bounded_value(arguments.next())?;
    expect_flag(arguments.next(), OsStr::new("--target"))?;
    let target = bounded_value(arguments.next())?;
    if arguments.next().is_some() {
        return Err(());
    }
    Ok(Arguments {
        bundle,
        product_root,
        target,
    })
}

fn expect_flag(value: Option<OsString>, expected: &OsStr) -> Result<(), ()> {
    match value {
        Some(value) if value == expected => Ok(()),
        _ => Err(()),
    }
}

fn bounded_value(value: Option<OsString>) -> Result<OsString, ()> {
    match value {
        Some(value)
            if !value.is_empty() && value.as_encoded_bytes().len() <= MAX_ARGUMENT_BYTES =>
        {
            Ok(value)
        }
        _ => Err(()),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_arguments;
    use std::ffi::OsString;

    #[test]
    fn refuses_one_argument_over_the_exact_contract() {
        let arguments = [
            "--bundle",
            "bundle",
            "--product-root",
            "product",
            "--target",
            "x86_64-pc-windows-msvc",
            "unexpected",
        ]
        .into_iter()
        .map(OsString::from);

        assert!(parse_arguments(arguments).is_err());
    }
}
