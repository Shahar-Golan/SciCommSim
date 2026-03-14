"""
Single-Speaker Presentation Analyzer
Analyzes solo presentations: speech activity, pacing, transcription
"""

import os
import json
import librosa
import soundfile as sf
import numpy as np
from pathlib import Path
import warnings
from datetime import timedelta

warnings.filterwarnings("ignore", category=UserWarning)


def convert_to_mono_wav(input_path, output_path, target_sr=16000):
    """
    Convert any audio file to mono WAV format
    
    Args:
        input_path: Input audio file
        output_path: Output WAV file path
        target_sr: Target sample rate (default 16000 Hz for speech)
    
    Returns:
        tuple: (audio array, sample rate, duration in seconds)
    """
    print(f"\n🎵 Converting to mono WAV...")
    print(f"  Input: {os.path.basename(input_path)}")
    
    audio, sr = librosa.load(input_path, sr=target_sr, mono=True)
    duration = len(audio) / sr
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    sf.write(output_path, audio, sr)
    
    print(f"  ✓ Converted to mono WAV")
    print(f"  ✓ Duration: {duration:.2f}s ({duration/60:.2f} minutes)")
    print(f"  ✓ Sample rate: {sr} Hz")
    
    return audio, sr, duration


def detect_speech_segments(audio, sr, frame_length=2048, hop_length=512, threshold=0.02):
    """
    Detect when speech is happening vs silence
    
    Args:
        audio: Audio signal
        sr: Sample rate
        frame_length: Frame size for analysis
        hop_length: Hop size between frames
        threshold: Energy threshold for speech detection
    
    Returns:
        list of (start_time, end_time) tuples for speech segments
    """
    print("\n🔍 Detecting speech segments...")
    
    # Calculate RMS energy
    rms = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)[0]
    
    # Convert to time
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    
    # Detect speech (energy above threshold)
    is_speech = rms > threshold
    
    # Find continuous segments
    segments = []
    in_segment = False
    start_time = 0
    
    for i, speech in enumerate(is_speech):
        if speech and not in_segment:
            # Start of speech segment
            start_time = times[i]
            in_segment = True
        elif not speech and in_segment:
            # End of speech segment
            end_time = times[i]
            if end_time - start_time > 0.5:  # Minimum 0.5s segment
                segments.append((start_time, end_time))
            in_segment = False
    
    # Handle case where speech continues to end
    if in_segment:
        segments.append((start_time, times[-1]))
    
    print(f"  ✓ Detected {len(segments)} speech segments")
    
    return segments


def extract_segment_audio_features(audio, sr, start_time, end_time, text=""):
    """
    Extract audio features for a specific segment
    
    Args:
        audio: Full audio signal
        sr: Sample rate
        start_time: Segment start time in seconds
        end_time: Segment end time in seconds
        text: Transcribed text for the segment
    
    Returns:
        dict with audio features
    """
    # Extract segment audio
    start_sample = int(start_time * sr)
    end_sample = int(end_time * sr)
    segment_audio = audio[start_sample:end_sample]
    
    if len(segment_audio) == 0:
        return None
    
    # Pitch analysis (using fundamental frequency)
    try:
        pitches, magnitudes = librosa.piptrack(y=segment_audio, sr=sr, fmin=75, fmax=400)
        # Extract pitch values where magnitude is above threshold
        pitch_values = []
        for t in range(pitches.shape[1]):
            index = magnitudes[:, t].argmax()
            pitch = pitches[index, t]
            if pitch > 0:
                pitch_values.append(pitch)
        
        pitch_mean = float(np.mean(pitch_values)) if pitch_values else 0.0
        pitch_range = float(np.max(pitch_values) - np.min(pitch_values)) if len(pitch_values) > 1 else 0.0
    except:
        pitch_mean = 0.0
        pitch_range = 0.0
    
    # Energy variance
    rms = librosa.feature.rms(y=segment_audio)[0]
    energy_variance = float(np.var(rms))
    
    # Words per minute
    duration_minutes = (end_time - start_time) / 60.0
    word_count = len(text.split()) if text else 0
    words_per_minute = (word_count / duration_minutes) if duration_minutes > 0 else 0.0
    
    # Detect filler words
    filler_word_list = ['um', 'uh', 'like', 'you know', 'so', 'actually', 'basically', 'literally']
    detected_fillers = []
    text_lower = text.lower() if text else ""
    for filler in filler_word_list:
        if filler in text_lower:
            detected_fillers.append(filler)
    
    return {
        'pitch_mean_hz': round(pitch_mean, 1),
        'pitch_range_hz': round(pitch_range, 1),
        'energy_variance': round(energy_variance, 6),
        'words_per_minute': round(words_per_minute, 1),
        'filler_words': detected_fillers
    }


def match_transcription_to_segments(merged_segments, transcription_segments, speaker_name=None, audio=None, sr=None):
    """
    Match transcription text to merged speech segments and extract audio features
    
    Args:
        merged_segments: List of (start, end) tuples for merged segments
        transcription_segments: Whisper transcription segments with text and timestamps
        speaker_name: Optional speaker name to add to each segment
        audio: Audio signal for feature extraction
        sr: Sample rate for feature extraction
    
    Returns:
        List of segments with transcription text and audio features
    """
    segments_with_text = []
    
    for seg_id, (start, end) in enumerate(merged_segments):
        # Find all transcription segments that overlap with this speech segment
        matching_texts = []
        
        for trans_seg in transcription_segments:
            trans_start = trans_seg['start']
            trans_end = trans_seg['end']
            
            # Check if there's overlap
            if trans_start < end and trans_end > start:
                matching_texts.append(trans_seg['text'].strip())
        
        # Combine all matching texts
        combined_text = ' '.join(matching_texts)
        word_count = len(combined_text.split()) if combined_text else 0
        
        segment_data = {
            'segment_id': f"seg_{seg_id:04d}",
            'start': float(start),
            'end': float(end),
            'duration': float(end - start),
            'text': combined_text,
            'word_count': word_count
        }
        
        # Add speaker if provided
        if speaker_name:
            segment_data['speaker'] = speaker_name
        
        # Extract audio features if audio is provided
        if audio is not None and sr is not None:
            audio_features = extract_segment_audio_features(audio, sr, start, end, combined_text)
            if audio_features:
                segment_data['audio_features'] = audio_features
        
        segments_with_text.append(segment_data)
    
    return segments_with_text


def analyze_speaking_pace(segments, total_duration, transcription_segments=None, speaker_name=None, audio=None, sr=None):
    """
    Analyze speaking pace and pauses
    
    Args:
        segments: List of (start, end) speech segments
        total_duration: Total audio duration
        transcription_segments: Optional Whisper transcription segments to match with speech
        speaker_name: Optional speaker name to add to each segment
        audio: Audio signal for feature extraction
        sr: Sample rate for feature extraction
    
    Returns:
        dict with pacing metrics
    """
    print("\n📊 Analyzing speaking pace...")
    
    if not segments:
        return {
            'total_speaking_time': 0,
            'total_silence_time': total_duration,
            'speaking_percentage': 0,
            'num_segments': 0,
            'pauses': [],
            'num_long_pauses': 0,
            'segments': []
        }
    
    # Calculate total speaking time
    speaking_time = sum(end - start for start, end in segments)
    silence_time = total_duration - speaking_time
    
    # Adapt minimum segment length based on recording duration
    # For short recordings (<30s), use 5 seconds minimum
    # For longer recordings, use 10 seconds minimum
    min_segment_length = 5.0 if total_duration < 30.0 else 10.0
    
    # Merge segments with pauses ≤2 seconds between them
    merged_segments = []
    if segments:
        current_start = segments[0][0]
        current_end = segments[0][1]
        
        for i in range(1, len(segments)):
            pause_duration = segments[i][0] - current_end
            
            if pause_duration <= 2.0:
                # Merge with current segment
                current_end = segments[i][1]
            else:
                # Save current segment if it meets minimum length
                if current_end - current_start >= min_segment_length:
                    merged_segments.append((current_start, current_end))
                # Start new segment
                current_start = segments[i][0]
                current_end = segments[i][1]
        
        # Don't forget the last segment
        if current_end - current_start >= min_segment_length:
            merged_segments.append((current_start, current_end))
    
    # Match transcription to merged segments if available
    segments_with_text = []
    if transcription_segments:
        segments_with_text = match_transcription_to_segments(
            merged_segments, transcription_segments, speaker_name, audio, sr
        )
    else:
        # Create segments without text
        for seg_id, (start, end) in enumerate(merged_segments):
            segment_data = {
                'segment_id': f"seg_{seg_id:04d}",
                'start': float(start),
                'end': float(end),
                'duration': float(end - start)
            }
            if speaker_name:
                segment_data['speaker'] = speaker_name
            
            # Extract audio features even without transcription
            if audio is not None and sr is not None:
                audio_features = extract_segment_audio_features(audio, sr, start, end, "")
                if audio_features:
                    segment_data['audio_features'] = audio_features
            
            segments_with_text.append(segment_data)
    
    # Find long pauses (gaps ≥5 seconds between original segments)
    long_pauses = []
    for i in range(len(segments) - 1):
        pause_start = segments[i][1]
        pause_end = segments[i + 1][0]
        pause_duration = pause_end - pause_start
        if pause_duration >= 5.0:  # Long pause defined as ≥5 seconds
            long_pauses.append({
                'start': pause_start,
                'duration': pause_duration
            })
    
    metrics = {
        'total_speaking_time': speaking_time,
        'total_silence_time': silence_time,
        'speaking_percentage': (speaking_time / total_duration * 100) if total_duration > 0 else 0,
        'num_segments': len(merged_segments),
        'num_long_pauses': len(long_pauses),
        'pauses': long_pauses,
        'avg_segment_length': sum(end - start for start, end in merged_segments) / len(merged_segments) if merged_segments else 0,
        'segments': segments_with_text
    }
    
    print(f"  ✓ Speaking time: {speaking_time:.1f}s ({metrics['speaking_percentage']:.1f}%)")
    print(f"  ✓ Silence time: {silence_time:.1f}s")
    print(f"  ✓ Speech segments: {len(merged_segments)}")
    print(f"  ✓ Long pauses (≥5s): {len(long_pauses)}")
    
    return metrics


def transcribe_audio(audio_path, language='en'):
    """
    Transcribe audio using Whisper
    
    Args:
        audio_path: Path to audio file
        language: Language code (default 'en' for English)
    
    Returns:
        dict with transcription results
    """
    print("\n📝 Transcribing audio...")
    
    try:
        import whisper
        import torch

        # Load model (base is good balance of speed/accuracy)
        print("  Loading Whisper model...")

        # Check device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {device}")

        # Load model on GPU
        print("Loading Whisper model...")
        model = whisper.load_model("base", device=device)

        print("Transcribing...")
        result = model.transcribe(audio_path, language='en', word_timestamps=True, fp16=(device=="cuda"))

        print(f"  ✓ Transcription complete")
        print(f"  ✓ Language: {language}")
        
        # Analyze pauses
        pauses = []
        for segment in result['segments']:
            words = segment.get('words', [])
            for i in range(len(words) - 1):
                pause_duration = words[i+1]['start'] - words[i]['end']
                if pause_duration > 0.3:  # Pauses longer than 300ms
                    pauses.append(pause_duration)
        
        avg_pause = sum(pauses) / len(pauses) if pauses else 0
        long_pauses = len([p for p in pauses if p > 1.0])
        
        pause_analysis = {
            'total_pauses': len(pauses),
            'avg_pause_duration': round(avg_pause, 2),
            'long_pauses_count': long_pauses
        }
        
        # Simplify segments by removing technical Whisper metadata but keeping word timestamps
        simplified_segments = []
        for seg in result['segments']:
            segment_data = {
                'id': seg['id'],
                'start': seg['start'],
                'end': seg['end'],
                'text': seg['text']
            }
            # Include word-level timestamps if available
            if 'words' in seg and seg['words']:
                segment_data['words'] = seg['words']
            simplified_segments.append(segment_data)
        
        return {
            'success': True,
            'text': result['text'],
            'language': language,
            'segments': simplified_segments,
            'pause_analysis': pause_analysis
        }
    
    except ImportError:
        print("  ⚠️  Whisper not available, skipping transcription")
        return {
            'success': False,
            'error': 'Whisper not installed'
        }
    except Exception as e:
        print(f"  ❌ Transcription failed: {e}")
        return {
            'success': False,
            'error': str(e)
        }


def analyze_single_speaker_presentation(
    audio_path,
    output_json_path,
    enable_transcription=True,
    speaker_name=None
):
    """
    Analyze a single-speaker presentation
    
    Args:
        audio_path: Path to audio file
        output_json_path: Path to save JSON results
        enable_transcription: Whether to transcribe audio
        speaker_name: Optional name of the speaker to include in segment data
    
    Returns:
        dict with analysis results
    """
    print("\n" + "="*80)
    print("SINGLE-SPEAKER PRESENTATION ANALYSIS")
    print("="*80)
    
    try:
        # Load audio
        print(f"\n📂 Loading audio: {os.path.basename(audio_path)}")
        audio, sr, duration = convert_to_mono_wav(audio_path, audio_path)
        
        # Transcribe if enabled (do this first to get segments)
        transcription = None
        transcription_segments = None
        if enable_transcription:
            transcription = transcribe_audio(audio_path)
            if transcription and transcription.get('success'):
                transcription_segments = transcription.get('segments', [])
        
        # Detect speech segments
        segments = detect_speech_segments(audio, sr)
        
        # Analyze pacing (with transcription and audio features if available)
        pacing = analyze_speaking_pace(segments, duration, transcription_segments, speaker_name, audio, sr)
        
        # Create result (simplified - removed technical fields)
        result = {
            'duration': duration,
            'speech_segments': pacing['segments'],  # Use segments with text
            'pacing_metrics': {
                'total_speaking_time': pacing['total_speaking_time'],
                'total_silence_time': pacing['total_silence_time'],
                'speaking_percentage': pacing['speaking_percentage'],
                'num_segments': pacing['num_segments'],
                'num_long_pauses': pacing['num_long_pauses'],
                'pauses': pacing['pauses'],
                'avg_segment_length': pacing['avg_segment_length']
            },
            'transcription': {
                'text': transcription['text'],
                'language': transcription['language'],
                'segments': transcription.get('segments', [])  # Include segments with word timestamps
            } if transcription and transcription['success'] else None,
            'pause_analysis': transcription.get('pause_analysis') if transcription and transcription.get('success') else None
        }
        
        # Save JSON
        output_dir = Path(output_json_path).parent
        output_dir.mkdir(parents=True, exist_ok=True)
        
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2)
        
        print(f"\n✓ Analysis saved to: {output_json_path}")
        
        # Print summary
        print("\n" + "="*80)
        print("ANALYSIS SUMMARY")
        print("="*80)
        print(f"Duration: {timedelta(seconds=int(duration))}")
        print(f"Speaking: {pacing['total_speaking_time']:.1f}s ({pacing['speaking_percentage']:.1f}%)")
        print(f"Silence: {pacing['total_silence_time']:.1f}s")
        print(f"Speech segments: {pacing['num_segments']}")
        print(f"Long pauses (≥5s): {pacing['num_long_pauses']}")
        
        if transcription and transcription['success']:
            print(f"\nTranscription preview:")
            preview = transcription['text'][:200]
            print(f"  {preview}{'...' if len(transcription['text']) > 200 else ''}")
        
        return result
        
    except Exception as e:
        print(f"\n❌ Analysis failed: {e}")
        import traceback
        traceback.print_exc()
        raise


def main():
    """Example usage"""
    
    # Example: Analyze a presentation recording
    AUDIO_FILE = r"C:\Users\golan\VisualStudioProjects\intelligent_interactive_systems\test_recording.wav"
    OUTPUT_DIR = r"C:\Users\golan\VisualStudioProjects\intelligent_interactive_systems\output"
    
    if not os.path.exists(AUDIO_FILE):
        print(f"Test audio file not found: {AUDIO_FILE}")
        print("\nThis script analyzes single-speaker presentations.")
        print("Usage:")
        print("  from single_speaker_analyzer import analyze_single_speaker_presentation")
        print("  result = analyze_single_speaker_presentation('audio.wav', 'output.json')")
        return
    
    output_json = os.path.join(OUTPUT_DIR, "analysis.json")
    result = analyze_single_speaker_presentation(
        AUDIO_FILE,
        output_json,
        enable_transcription=True
    )
    
    print("\n✓ Analysis complete!")


if __name__ == "__main__":
    main()
