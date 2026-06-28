//! Turning scores into a choice with a human amount of randomness. A cold
//! commander takes the argmax every time and plays like a solver; sampling from
//! a softmax lets it sometimes take the second-best line, which (with the
//! drifting `bravado` mood that biases the scores upstream) is what makes the AI
//! read as a person rather than a search. Deterministic given the RNG.

use contract::Pcg32;

/// Sample an index weighted by `exp((score_i - max) / scale)`. `scale` is the
/// softmax temperature in score units: larger spreads the probability (more
/// exploratory), near-zero collapses to argmax. The RNG draw is the only
/// nondeterminism, so a fixed seed always picks the same plan.
pub fn pick_softmax(scores: &[f64], scale: f64, rng: &mut Pcg32) -> usize {
    if scores.is_empty() {
        return 0;
    }
    let max = scores.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let scale = scale.max(1.0);
    let weights: Vec<f64> = scores.iter().map(|&s| ((s - max) / scale).exp()).collect();
    let total: f64 = weights.iter().sum();
    // One draw scaled to the weight sum, then walk the cumulative distribution.
    let mut r = rng.unit_f32() as f64 * total;
    for (i, &w) in weights.iter().enumerate() {
        r -= w;
        if r <= 0.0 {
            return i;
        }
    }
    weights.len() - 1 // float slop fell off the end: take the last
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_dominant_score_almost_always_wins() {
        let mut rng = Pcg32::new(1, 1);
        let scores = [0.0, 100_000.0, 50.0]; // index 1 dwarfs the rest
        let hits = (0..300).filter(|_| pick_softmax(&scores, 15_000.0, &mut rng) == 1).count();
        assert!(hits > 285, "a clearly-best plan should win nearly always, got {hits}/300");
    }

    #[test]
    fn close_scores_get_sampled() {
        let mut rng = Pcg32::new(2, 2);
        let scores = [100.0, 110.0]; // within the temperature: both should appear
        let zeros = (0..300).filter(|_| pick_softmax(&scores, 50.0, &mut rng) == 0).count();
        assert!((30..270).contains(&zeros), "near-ties should both be sampled, got {zeros}/300");
    }

    #[test]
    fn deterministic_given_seed() {
        let scores = [10.0, 20.0, 15.0];
        let mut r1 = Pcg32::new(42, 7);
        let mut r2 = Pcg32::new(42, 7);
        let a: Vec<usize> = (0..40).map(|_| pick_softmax(&scores, 5.0, &mut r1)).collect();
        let b: Vec<usize> = (0..40).map(|_| pick_softmax(&scores, 5.0, &mut r2)).collect();
        assert_eq!(a, b, "same seed must give the same picks");
    }
}
