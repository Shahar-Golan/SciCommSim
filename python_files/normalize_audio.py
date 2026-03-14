import argparse
import json
import librosa
import soundfile as sf


def normalize_audio(input_path: str, output_path: str, target_sr: int = 16000):
    audio, sr = librosa.load(input_path, sr=target_sr, mono=True)
    sf.write(output_path, audio, sr)
    duration_sec = len(audio) / sr if sr > 0 else 0
    return {
        "durationSec": round(duration_sec, 4),
        "sampleRate": sr,
        "numSamples": len(audio),
    }


def main():
    parser = argparse.ArgumentParser(description="Normalize audio to mono WAV")
    parser.add_argument("--input", required=True, help="Input audio path")
    parser.add_argument("--output", required=True, help="Output WAV path")
    parser.add_argument("--sample-rate", type=int, default=16000, help="Target sample rate")
    args = parser.parse_args()

    result = normalize_audio(args.input, args.output, args.sample_rate)
    print(json.dumps({"ok": True, **result}))


if __name__ == "__main__":
    main()
