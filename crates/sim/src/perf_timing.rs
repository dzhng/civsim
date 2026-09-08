//! Native-only diagnostic scopes. Disabled macros expand to nothing.
#[cfg(feature = "perf_timing")]
mod enabled {
    use std::{
        cell::RefCell,
        collections::BTreeMap,
        time::{Duration, Instant},
    };
    thread_local! {
        static TIMES: RefCell<BTreeMap<&'static str, Duration>> = RefCell::new(BTreeMap::new());
        static CHILDREN: RefCell<Vec<Duration>> = const { RefCell::new(Vec::new()) };
    }
    pub struct Scope {
        name: &'static str,
        start: Instant,
    }
    impl Scope {
        pub fn new(name: &'static str) -> Self {
            CHILDREN.with(|v| v.borrow_mut().push(Duration::ZERO));
            Self {
                name,
                start: Instant::now(),
            }
        }
    }
    impl Drop for Scope {
        fn drop(&mut self) {
            let elapsed = self.start.elapsed();
            let children = CHILDREN.with(|v| {
                let mut stack = v.borrow_mut();
                let children = stack.pop().unwrap();
                if let Some(parent) = stack.last_mut() {
                    *parent += elapsed;
                }
                children
            });
            TIMES.with(|v| {
                *v.borrow_mut().entry(self.name).or_default() += elapsed.saturating_sub(children)
            });
        }
    }
    pub fn reset() {
        TIMES.with(|v| v.borrow_mut().clear());
    }
    pub fn report(ticks: usize) {
        TIMES.with(|v| {
            eprintln!("stage (exclusive)                         ms/tick");
            for (name, time) in v.borrow().iter() {
                eprintln!(
                    "{name:40} {:9.3}",
                    time.as_secs_f64() * 1000.0 / ticks as f64
                );
            }
        });
    }
}
#[cfg(feature = "perf_timing")]
pub use enabled::*;
macro_rules! perf_scope {
    ($var:ident, $name:literal) => {
        #[cfg(feature = "perf_timing")]
        let $var = crate::perf_timing::Scope::new($name);
    };
}
macro_rules! perf_next {
    ($var:ident, $name:literal) => {
        #[cfg(feature = "perf_timing")]
        drop($var);
        perf_scope!($var, $name);
    };
}
