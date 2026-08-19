---
name: edge-ai
description: On-rover edge deployment constraints for TerraSight perception — keeping segmentation, stereo depth, and SLAM runnable on rover-class compute without an Earth link. Use when optimizing model size/latency, choosing backbones, quantizing, or reasoning about the "without waiting on Earth" real-time requirement.
---

# edge-ai

TerraSight runs perception **on the rover** — no round-trip to Earth. Every
model/algorithm choice is bounded by rover-class compute, power, and memory.

## Guidance

- Favor compact, quantization-friendly models for `segmentation`; the rover
  runs inference, not a datacenter.
- SLAM must be bounded-memory and incremental (`slam-mapping`) — no offline
  global bundle adjustment the rover can't afford.
- Prefer classical/geometric methods where they match a heavy net (stereo
  disparity, slope from depth) — cheaper and more predictable on device.
- Latency budget is real-time-ish: the rover acts on `zone`/`safety_score`
  live. Profile before adding a heavier stage.

## Constraints

- **Don't move the safety layer onto a GPU it doesn't need.** `scoring.py` is
  pure Python rules and effectively free — keep it that way; the cost budget is
  for perception.
- Edge limits are a real design input, not an excuse to drop the class
  taxonomy or confidence outputs the safety layer depends on.
- This skill is about *deployment shape*, not new functionality — don't invent
  hardware or runtimes not established by the project.
