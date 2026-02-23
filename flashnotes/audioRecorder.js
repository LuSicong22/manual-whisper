/**
 * Audio Recorder module for manual-whisper
 */

export class AudioRecorder {
    constructor(targetSampleRate = 16000) {
        this.targetSampleRate = targetSampleRate;
        this.audioContext = null;
        this.scriptProcessor = null;
        this.mediaStreamSource = null;
        this.recordingStream = null;
        this.audioBuffers = [];
        this.recordingLength = 0;
        this.isRecording = false;
        this.onVolumeChange = null;
    }

    async start() {
        try {
            this.recordingStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: this.targetSampleRate
                }
            });
        } catch (err) {
            console.error('Microphone access denied:', err);
            throw new Error('无法访问麦克风，请在浏览器中允许麦克风权限。');
        }

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this.targetSampleRate });
        this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.recordingStream);
        this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.audioBuffers = [];
        this.recordingLength = 0;

        this.scriptProcessor.onaudioprocess = (e) => {
            if (!this.isRecording) return;
            const channelData = e.inputBuffer.getChannelData(0);
            const buffer = new Float32Array(channelData.length);
            buffer.set(channelData);
            this.audioBuffers.push(buffer);
            this.recordingLength += buffer.length;

            if (this.onVolumeChange) {
                let sum = 0;
                for (let i = 0; i < channelData.length; i++) {
                    sum += channelData[i] * channelData[i];
                }
                const rms = Math.sqrt(sum / channelData.length);
                this.onVolumeChange(rms);
            }
        };

        this.mediaStreamSource.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.audioContext.destination);
        this.isRecording = true;
    }

    stop() {
        this.isRecording = false;
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.mediaStreamSource.disconnect();
        }

        const audioData = this.mergeAudioBuffers(this.audioBuffers, this.recordingLength);
        const wavBlob = this.encodeWAV(audioData, this.audioContext.sampleRate);

        return wavBlob;
    }

    cleanup() {
        this.isRecording = false;
        if (this.recordingStream) {
            this.recordingStream.getTracks().forEach((t) => t.stop());
            this.recordingStream = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.audioBuffers = [];
        this.recordingLength = 0;
        this.audioContext = null;
        this.scriptProcessor = null;
        this.mediaStreamSource = null;
    }

    mergeAudioBuffers(channelBuffer, recordingLength) {
        const result = new Float32Array(recordingLength);
        let offset = 0;
        for (let i = 0; i < channelBuffer.length; i++) {
            const buffer = channelBuffer[i];
            result.set(buffer, offset);
            offset += buffer.length;
        }
        return result;
    }

    encodeWAV(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        this.writeString(view, 8, 'WAVE');

        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);

        this.writeString(view, 36, 'data');
        view.setUint32(40, samples.length * 2, true);

        let offset = 44;
        for (let i = 0; i < samples.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}
