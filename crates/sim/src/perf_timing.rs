//! Opt-in exclusive stage diagnostics. Disabled macros expand to nothing.
#[cfg(feature = "perf_timing")]
mod enabled {
    use std::{
        cell::{Cell, RefCell},
        collections::BTreeMap,
        time::Instant,
    };
    thread_local! {
        static CLOCK: Cell<fn() -> f64> = Cell::new(native_now);
        static EPOCH: Instant = Instant::now();
        static TIMES: RefCell<BTreeMap<&'static str, f64>> = RefCell::new(BTreeMap::new());
        static CHILDREN: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
    }
    fn native_now() -> f64 {
        EPOCH.with(|epoch| epoch.elapsed().as_secs_f64() * 1000.0)
    }
    /// The WASM host supplies its monotonic clock before constructing any scopes.
    /// Native tools use Instant without configuration.
    pub fn set_clock(clock: fn() -> f64) {
        CLOCK.with(|slot| slot.set(clock));
    }
    fn now() -> f64 {
        CLOCK.with(|clock| clock.get()())
    }
    pub struct Scope {
        name: &'static str,
        start: f64,
    }
    impl Scope {
        pub fn new(name: &'static str) -> Self {
            CHILDREN.with(|v| v.borrow_mut().push(0.0));
            Self { name, start: now() }
        }
    }
    impl Drop for Scope {
        fn drop(&mut self) {
            let elapsed = now() - self.start;
            let children = CHILDREN.with(|v| {
                let mut stack = v.borrow_mut();
                let children = stack.pop().unwrap();
                if let Some(parent) = stack.last_mut() {
                    *parent += elapsed;
                }
                children
            });
            TIMES.with(|v| {
                *v.borrow_mut().entry(self.name).or_default() += (elapsed - children).max(0.0)
            });
        }
    }
    pub fn reset() {
        TIMES.with(|v| v.borrow_mut().clear());
    }
    pub fn snapshot(ticks: usize) -> Vec<(&'static str, f64)> {
        assert!(ticks > 0, "stage averages need at least one measured tick");
        TIMES.with(|times| {
            times
                .borrow()
                .iter()
                .map(|(&name, &ms)| (name, ms / ticks as f64))
                .collect()
        })
    }
    pub fn report(ticks: usize) {
        TIMES.with(|v| {
            eprintln!("stage (exclusive)                         ms/tick");
            for (name, time) in v.borrow().iter() {
                eprintln!("{name:40} {:9.3}", time / ticks as f64);
            }
        });
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        thread_local! { static TEST_TIME: Cell<f64> = const { Cell::new(0.0) }; }
        fn test_now() -> f64 {
            TEST_TIME.with(Cell::get)
        }
        #[test]
        #[should_panic(expected = "at least one measured tick")]
        fn empty_window_has_no_stage_average() {
            snapshot(0);
        }
        #[test]
        fn nested_scopes_report_exclusive_time_and_reset() {
            set_clock(test_now);
            reset();
            {
                let _outer = Scope::new("outer");
                TEST_TIME.with(|clock| clock.set(2.0));
                {
                    let _inner = Scope::new("inner");
                    TEST_TIME.with(|clock| clock.set(5.0));
                }
                TEST_TIME.with(|clock| clock.set(9.0));
            }
            assert_eq!(snapshot(1), vec![("inner", 3.0), ("outer", 6.0)]);
            assert_eq!(snapshot(3), vec![("inner", 1.0), ("outer", 2.0)]);
            reset();
            assert!(snapshot(1).is_empty());
            set_clock(native_now);
        }
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
