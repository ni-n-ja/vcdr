'use strict'
window.AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext = new AudioContext();
var carrierBuffer = null;
var modulatorNode = null;
var carrierNode = null;
var startFreq = 55,
    endFreq = 7040,
    numBands = 28;
var totalRangeInCents = 1200 * Math.log(endFreq / startFreq) / Math.LN2;
var centsPerBand = totalRangeInCents / numBands;
var scale = Math.pow(2, centsPerBand / 1200);

var vocoderBands = new Array();
var currentFreq = startFreq;

for (var i = 0; i < numBands; i++) {
    vocoderBands[i] = new Object();
    vocoderBands[i].frequency = currentFreq;
    currentFreq = currentFreq * scale;
}

var numVocoderBands = numBands;
var FILTER_QUALITY = 6;

var modulatorInput = null;
var carrierInput = null;

var modulatorGain = null;
var modulatorGainValue = 1.0;

var noiseBuffer = null;
var noiseNode = null;
var noiseGain = null;
var noiseGainValue = 0.2;

var carrierSampleNode = null;
var carrierSampleGain = null;
var carrierSampleGainValue = 0.0;

var oscillatorNode = null;
var oscillatorType = 4;
var oscillatorGain = null;
var oscillatorGainValue = 1.0;
var oscillatorDetuneValue = 0;
var FOURIER_SIZE = 2048;
var wavetable = null;
var wavetableSignalGain = null;
var WAVETABLEBOOST = 40.0;
var SAWTOOTHBOOST = 0.40;

var modFilterBands = null;
var modFilterPostGains = null;
var heterodynes = null;
var powers = null;
var lpFilters = null;
var lpFilterPostGains = null;
var bandAnalysers = null;
var carrierBands = null;
var carrierFilterPostGains = null;
var carrierBandGains = null;
var modulatorCanvas = null;
var carrierCanvas = null;
var outputCanvas = null;
var DEBUG_BAND = 5;
var vocoderBands;
var numVocoderBands;
var hpFilterGain = null;
var lpInputFilter = null;
var modulatorBuffer;

// audioContext.decodeAudioData(request.response, function (buffer) {
// modulatorBuffer = buffer;
modulatorInput = audioContext.createGain();
carrierInput = audioContext.createGain();
modFilterBands = new Array();
modFilterPostGains = new Array();
heterodynes = new Array();
powers = new Array();
lpFilters = new Array();
lpFilterPostGains = new Array();
bandAnalysers = new Array();
carrierBands = new Array();
carrierFilterPostGains = new Array();
carrierBandGains = new Array();
var waveShaperCurve = new Float32Array(65536);
var n = 65536;
var n2 = n / 2;

for (var i = 0; i < n2; ++i) {
    let x = i / n2;
    waveShaperCurve[n2 + i] = x;
    waveShaperCurve[n2 - i - 1] = x;
}

var hpFilter = audioContext.createBiquadFilter();
hpFilter.type = "highpass";
hpFilter.frequency.value = 8000;
hpFilter.Q.value = 1;
modulatorInput.connect(hpFilter);

hpFilterGain = audioContext.createGain();
hpFilterGain.gain.value = 0.0;

hpFilter.connect(hpFilterGain);
hpFilterGain.connect(audioContext.destination);

modFilterBands.length = 0;
modFilterPostGains.length = 0;
heterodynes.length = 0;
powers.length = 0;
lpFilters.length = 0;
lpFilterPostGains.length = 0;
carrierBands.length = 0;
carrierFilterPostGains.length = 0;
carrierBandGains.length = 0;
bandAnalysers.length = 0;

var outputGain = audioContext.createGain();
outputGain.gain.value = 0.5;
outputGain.connect(audioContext.destination);

var rectifierCurve = new Float32Array(65536);
for (var i = -32768; i < 32768; i++)
    rectifierCurve[i + 32768] = ((i > 0) ? i : -i) / 32768;

for (var i = 0; i < numVocoderBands; i++) {
    var modulatorFilter = audioContext.createBiquadFilter();
    modulatorFilter.type = "bandpass";
    modulatorFilter.frequency.value = vocoderBands[i].frequency;
    modulatorFilter.Q.value = FILTER_QUALITY;
    modulatorInput.connect(modulatorFilter);
    modFilterBands.push(modulatorFilter);

    var secondModulatorFilter = audioContext.createBiquadFilter();
    secondModulatorFilter.type = "bandpass";
    secondModulatorFilter.frequency.value = vocoderBands[i].frequency;
    secondModulatorFilter.Q.value = FILTER_QUALITY;
    modulatorFilter.chainedFilter = secondModulatorFilter;
    modulatorFilter.connect(secondModulatorFilter);

    var modulatorFilterPostGain = audioContext.createGain();
    modulatorFilterPostGain.gain.value = 6;
    secondModulatorFilter.connect(modulatorFilterPostGain);
    modFilterPostGains.push(modulatorFilterPostGain);

    var heterodyneOscillator = audioContext.createOscillator();
    heterodyneOscillator.frequency.value = vocoderBands[i].frequency;
    heterodyneOscillator.start(0);

    var heterodyne = audioContext.createGain();
    modulatorFilterPostGain.connect(heterodyne);
    heterodyne.gain.value = 0.0;
    heterodyneOscillator.connect(heterodyne.gain);

    var heterodynePostGain = audioContext.createGain();
    heterodynePostGain.gain.value = 2.0;
    heterodyne.connect(heterodynePostGain);
    heterodynes.push(heterodynePostGain);

    var rectifier = audioContext.createWaveShaper();
    rectifier.curve = rectifierCurve;
    heterodynePostGain.connect(rectifier);

    var lpFilter = audioContext.createBiquadFilter();
    lpFilter.type = "lowpass";
    lpFilter.frequency.value = 5.0;
    lpFilter.Q.value = 1;
    lpFilters.push(lpFilter);
    rectifier.connect(lpFilter);

    var lpFilterPostGain = audioContext.createGain();
    lpFilterPostGain.gain.value = 1.0;
    lpFilter.connect(lpFilterPostGain);
    lpFilterPostGains.push(lpFilterPostGain);

    var waveshaper = audioContext.createWaveShaper();
    waveshaper.curve = waveShaperCurve;
    lpFilterPostGain.connect(waveshaper);

    var analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    waveshaper.connect(analyser);
    bandAnalysers.push(analyser);

    var carrierFilter = audioContext.createBiquadFilter();
    carrierFilter.type = "bandpass";
    carrierFilter.frequency.value = vocoderBands[i].frequency;
    carrierFilter.Q.value = FILTER_QUALITY;
    carrierBands.push(carrierFilter);
    carrierInput.connect(carrierFilter);

    var secondCarrierFilter = audioContext.createBiquadFilter();
    secondCarrierFilter.type = "bandpass";
    secondCarrierFilter.frequency.value = vocoderBands[i].frequency;
    secondCarrierFilter.Q.value = FILTER_QUALITY;
    carrierFilter.chainedFilter = secondCarrierFilter;
    carrierFilter.connect(secondCarrierFilter);

    var carrierFilterPostGain = audioContext.createGain();
    carrierFilterPostGain.gain.value = 10.0;
    secondCarrierFilter.connect(carrierFilterPostGain);
    carrierFilterPostGains.push(carrierFilterPostGain);

    var bandGain = audioContext.createGain();
    carrierBandGains.push(bandGain);
    carrierFilterPostGain.connect(bandGain);
    bandGain.gain.value = 0.0;
    waveshaper.connect(bandGain.gain);

    bandGain.connect(outputGain);
}

var real = new Float32Array(FOURIER_SIZE);
var imag = new Float32Array(FOURIER_SIZE);
real[0] = 0.0;
imag[0] = 0.0;
for (var i = 1; i < FOURIER_SIZE; i++) {
    real[i] = 1.0;
    imag[i] = 1.0;
}

wavetable = (audioContext.createPeriodicWave) ?
    audioContext.createPeriodicWave(real, imag) :
    audioContext.createWaveTable(real, imag);
var lengthInSamples = 5 * audioContext.sampleRate;
noiseBuffer = audioContext.createBuffer(1, lengthInSamples, audioContext.sampleRate);
var bufferData = noiseBuffer.getChannelData(0);
for (var i = 0; i < lengthInSamples; ++i) {
    bufferData[i] = (2 * Math.random() - 1);
}

carrierSampleNode = audioContext.createBufferSource();
carrierSampleNode.buffer = carrierBuffer;
carrierSampleNode.loop = true;

carrierSampleGain = audioContext.createGain();
carrierSampleGain.gain.value = carrierSampleGainValue;
carrierSampleNode.connect(carrierSampleGain);
carrierSampleGain.connect(carrierInput);

wavetableSignalGain = audioContext.createGain();

oscillatorNode = audioContext.createOscillator();
if (oscillatorType = 4) {
    oscillatorNode.setPeriodicWave ?
        oscillatorNode.setPeriodicWave(wavetable) :
        oscillatorNode.setWaveTable(wavetable);
    wavetableSignalGain.gain.value = WAVETABLEBOOST;
} else {
    oscillatorNode.type = oscillatorType;
    wavetableSignalGain.gain.value = SAWTOOTHBOOST;
}
oscillatorNode.frequency.value = 110;
//oscillatorNode.frequency.value = 110;
oscillatorNode.detune.value = oscillatorDetuneValue;
oscillatorNode.connect(wavetableSignalGain);

oscillatorGain = audioContext.createGain();
oscillatorGain.gain.value = oscillatorGainValue;

wavetableSignalGain.connect(oscillatorGain);
oscillatorGain.connect(carrierInput);

noiseNode = audioContext.createBufferSource();
noiseNode.buffer = noiseBuffer;
noiseNode.loop = true;
noiseGain = audioContext.createGain();
noiseGain.gain.value = noiseGainValue;
noiseNode.connect(noiseGain);

noiseGain.connect(carrierInput);
oscillatorNode.start(0);
noiseNode.start(0);

if (!navigator.getUserMedia)
    navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
navigator.getUserMedia({
        "audio": {
            "mandatory": {
                "googEchoCancellation": "false",
                "googAutoGainControl": "false",
                "googNoiseSuppression": "false",
                "googHighpassFilter": "false"
            },
            "optional": []
        }
    },
    (stream) => {
        var mediaStreamSource = audioContext.createMediaStreamSource(stream);
        modulatorGain = audioContext.createGain();
        modulatorGain.gain.value = modulatorGainValue;
        modulatorGain.connect(modulatorInput);
        var splitter = audioContext.createChannelSplitter(2);
        var merger = audioContext.createChannelMerger(2);
        mediaStreamSource.connect(splitter);
        splitter.connect(merger, 0, 0);
        splitter.connect(merger, 0, 1);
        var monoSource = merger;

        lpInputFilter = audioContext.createBiquadFilter();
        var inputNode = audioContext.createGain();
        var rectifier = audioContext.createWaveShaper();
        var ngFollower = audioContext.createBiquadFilter();
        ngFollower.type = ngFollower.LOWPASS;
        ngFollower.frequency.value = 10.0;
        var curve = new Float32Array(65536);
        for (var i = -32768; i < 32768; i++)
            curve[i + 32768] = ((i > 0) ? i : -i) / 32768;
        rectifier.curve = curve;
        rectifier.connect(ngFollower);
        var ngGate = audioContext.createWaveShaper();
        var curve = new Float32Array(65536);
        var mappedFloor = 0.01 * 32768;
        for (var i = 0; i < 32768; i++) {
            var value = (i < mappedFloor) ? 0 : 1;
            curve[32768 - i] = -value;
            curve[32768 + i] = value;
        }
        curve[0] = curve[1]; // fixing up the end.
        ngGate.curve = curve;
        ngFollower.connect(ngGate);
        var gateGain = audioContext.createGain();
        gateGain.gain.value = 0.0;
        ngGate.connect(gateGain.gain);
        gateGain.connect(modulatorGain);
        inputNode.connect(rectifier);
        inputNode.connect(gateGain);
        lpInputFilter.connect(inputNode);

        lpInputFilter.frequency.value = 2048;
        monoSource.connect(lpInputFilter);

        carrierSampleNode = audioContext.createBufferSource();
        carrierSampleNode.buffer = carrierBuffer;
        carrierSampleNode.loop = true;

        carrierSampleGain = audioContext.createGain();
        carrierSampleGain.gain.value = carrierSampleGainValue;
        carrierSampleNode.connect(carrierSampleGain);
        carrierSampleGain.connect(carrierInput);

        wavetableSignalGain = audioContext.createGain();

        oscillatorNode = audioContext.createOscillator();
        if (oscillatorType = 4) {
            oscillatorNode.setPeriodicWave ?
                oscillatorNode.setPeriodicWave(wavetable) :
                oscillatorNode.setWaveTable(wavetable);
            wavetableSignalGain.gain.value = WAVETABLEBOOST;
        } else {
            oscillatorNode.type = oscillatorType;
            wavetableSignalGain.gain.value = SAWTOOTHBOOST;
        }
        oscillatorNode.frequency.value = 110;
        oscillatorNode.detune.value = oscillatorDetuneValue;
        oscillatorNode.connect(wavetableSignalGain);

        oscillatorGain = audioContext.createGain();
        oscillatorGain.gain.value = oscillatorGainValue;

        wavetableSignalGain.connect(oscillatorGain);
        oscillatorGain.connect(carrierInput);

        noiseNode = audioContext.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;
        noiseGain = audioContext.createGain();
        noiseGain.gain.value = noiseGainValue;
        noiseNode.connect(noiseGain);

        noiseGain.connect(carrierInput);
        oscillatorNode.start(0);
        noiseNode.start(0);
        carrierSampleNode.start(0);

    }, (err) => {});
