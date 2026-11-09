mod application;
mod attachment;
mod claimipedia;
mod declared_web;
mod http;
mod image;
mod launch;
mod process;
mod profile;
mod rel;
mod sqlite;
mod store;
mod verification;
mod workgarden;
mod web;

use launch::Launch;
use std::{env, path::Path, process::ExitCode};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

fn fail(message: impl Into<String>) -> Box<dyn std::error::Error> { message.into().into() }

fn execute_config(file: &Path, args: &[String]) -> Result<ExitCode> {
    match (Launch::read(file)?, args) {
        (Launch::Image { image, pin, store, port, attachment_root }, [command]) if command == "serve" =>
            declared_web::serve_image(image::load(&image, &pin)?, &store, port, attachment_root.as_deref())?,
        (Launch::Workgarden { root, journal, port }, [command]) if command == "serve" =>
            web::serve_in(&root, &journal, port)?,
        (Launch::Workgarden { root, journal, .. }, [command, basis, operation, title]) if command == "run" =>
            run_workgarden(&root, &journal, basis, operation, title)?,
        (Launch::Workgarden { root, .. }, [command]) if command == "test" =>
            verification::run(&root)?,
        _ => return Err(fail("command unavailable for this launch configuration")),
    }
    Ok(ExitCode::SUCCESS)
}

fn run_workgarden(root: &Path, journal: &Path, basis: &str, operation: &str, title: &str) -> Result<()> {
    let profile = profile::Profile::load(root)?;
    let outcome = workgarden::run(&profile, journal, basis, operation, title)?;
    println!("{}", serde_json::to_string(&outcome)?);
    Ok(())
}

fn execute(args: &[String]) -> Result<ExitCode> {
    match args {
        [flag, file, rest @ ..] if flag == "--config" => execute_config(Path::new(file), rest),
        [flag] if flag == "--version" => {
            println!("encounter {}", env!("CARGO_PKG_VERSION"));
            Ok(ExitCode::SUCCESS)
        }
        [command, journal, basis, operation, title] if command == "run" => {
            run_workgarden(&profile::root(), Path::new(journal), basis, operation, title)?;
            Ok(ExitCode::SUCCESS)
        }
        [command, flag, app] if command == "serve" && flag == "--app" && app == "claimipedia" =>
            claimipedia::serve(24212).map(|_| ExitCode::SUCCESS),
        [command, flag, app, port] if command == "serve" && flag == "--app" && app == "claimipedia" =>
            claimipedia::serve(port.parse()?).map(|_| ExitCode::SUCCESS),
        [command, root, declaration, output] if command == "build" => {
            println!("{}", image::build(Path::new(root), declaration, Path::new(output))?);
            Ok(ExitCode::SUCCESS)
        }
        [command, flag, file, pin, directory, port]
            if command == "serve" && flag == "--image" =>
            declared_web::serve_image(image::load(Path::new(file), pin)?, Path::new(directory), port.parse()?, None)
                .map(|_| ExitCode::SUCCESS),
        [command, flag, root, declaration, directory, port]
            if command == "serve" && flag == "--declaration" =>
            declared_web::serve(Path::new(root), declaration, Path::new(directory), port.parse()?)
                .map(|_| ExitCode::SUCCESS),
        [command, journal] if command == "serve" => web::serve(Path::new(journal), 4187).map(|_| ExitCode::SUCCESS),
        [command, journal, port] if command == "serve" => web::serve(Path::new(journal), port.parse()?).map(|_| ExitCode::SUCCESS),
        [command, root, declaration] if command == "check" => {
            let admitted = application::Application::load(Path::new(root), declaration)?.check()?;
            Ok(if admitted { ExitCode::SUCCESS } else { ExitCode::from(2) })
        }
        [command] if command == "test" => verification::run(&profile::root()).map(|_| ExitCode::SUCCESS),
        _ => Err(fail("usage: encounter --version | encounter --config FILE COMMAND | encounter run JOURNAL BASIS OPERATION TITLE | encounter serve JOURNAL [PORT] | encounter serve --app claimipedia [PORT] | encounter serve --declaration APP_ROOT DECLARATION STORE PORT | encounter build APP_ROOT DECLARATION OUTPUT | encounter serve --image IMAGE SHA256 STORE PORT | encounter check APP_ROOT DECLARATION | encounter test")),
    }
}

fn main() -> ExitCode {
    match execute(&env::args().skip(1).collect::<Vec<_>>()) {
        Ok(status) => status,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
