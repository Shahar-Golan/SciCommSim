#!/usr/bin/env python3
"""
Prosody feature extractor for a single normalized WAV speech segment.
Outputs a single JSON line to stdout with numeric features.

Usage:
    python analyze_prosody_segment.py --input <path_to_wav>
"""

import argparse
import json
import sys
import warnings

import librosa
import numpy as np

warnings.filterwarnings("ignore")


def extract_prosody_features(wav_path: str) -> dict:
    audio, sr = librosa.load(wav_path, sr=None, mono=True)
    duration_sec = float(len(audio)) / float(sr)
    duration_min = duration_sec / 60.0

    # --- Pitch analysis via piptrack ---
    pitches, magnitudes = librosa.piptrack(y=audio, sr=sr, fmin=75, fmax=400)
    pitch_values = []
    for t in range(pitches.shape[1]):
        idx = int(magnitudes[:, t].argmax())
        p = float(pitches[idx, t])
        if p > 0:
            pitch_values.append(p)

    pitch_mean_hz = round(float(np.mean(pitch_values)), 2) if pitch_values else 0.0
    pitch_range_hz = (
        round(float(np.max(pitch_values) - np.min(pitch_values)), 2)
        if len(pitch_values) > 1
        else 0.0
    )

    # --- Energy variance over full signal ---
    rms_frames = librosa.feature.rms(y=audio, frame_length=2048, hop_length=512)[0]
    energy_variance = round(float(np.var(rms_frames)), 6)

    # --- Speech-segment / pause detection (RMS energy threshold) ---
    times = librosa.frames_to_time(np.arange(len(rms_frames)), sr=sr, hop_length=512)
    is_speech = rms_frames > 0.02

    raw_segs: list = []
    in_seg = False
    seg_start = 0.0
    for i, speaking in enumerate(is_speech):
        if speaking and not in_seg:
            seg_start = float(times[i])
            in_seg = True
        elif not speaking and in_seg:
            seg_end = float(times[i])
            if seg_end - seg_start > 0.5:
                raw_segs.append((seg_start, seg_end))
            in_seg = False
    if in_seg:
        raw_segs.append((seg_start, float(times[-1])))

    # --- Long pauses: adaptive threshold based on clip length ---
    # For short clips (<30s) use 1-second gaps; for longer clips use 5 seconds.
    pause_threshold = 1.0 if duration_sec < 30.0 else 5.0
    long_pauses = []
    for i in range(len(raw_segs) - 1):
        gap = raw_segs[i + 1][0] - raw_segs[i][1]
        if gap >= pause_threshold:
            long_pauses.append(
                {
                    "startSec": round(raw_segs[i][1], 2),
                    "durationSec": round(gap, 2),
                }
            )

    long_pause_count = len(long_pauses)
    pause_freq_per_min = (
        round(long_pause_count / duration_min, 2) if duration_min > 0 else 0.0
    )

    speaking_time_sec = sum(e - s for s, e in raw_segs)

    return {
        "ok": True,
        "durationSec": round(duration_sec, 2),
        "pitchMeanHz": pitch_mean_hz,
        "pitchRangeHz": pitch_range_hz,
        "energyVariance": energy_variance,
        "longPauseCount": long_pause_count,
        "pauseFreqPerMin": pause_freq_per_min,
        "rawDiagnostics": {
            "numRawSpeechSegments": len(raw_segs),
            "speakingTimeSec": round(speaking_time_sec, 2),
            "silenceTimeSec": round(duration_sec - speaking_time_sec, 2),
            "longPauses": long_pauses,
            "numPitchFrames": len(pitch_values),
            "pauseThresholdSec": pause_threshold,
        },
    }


def main():
    parser = argparse.ArgumentParser(
        description="Extract numeric prosody features from a normalized WAV segment."
    )
    parser.add_argument(
        "--input", required=True, help="Path to the normalized 16 kHz mono WAV file"
    )
    args = parser.parse_args()

    try:
        result = extract_prosody_features(args.input)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
