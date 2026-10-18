class ToneAudioWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.disposed = false;
    this.blockSize = 128;
    this.sampleRate = sampleRate;
    this.port.onmessage = (event) => {
      if (event.data === "dispose") this.disposed = true;
    };
  }
}

class SingleIOProcessor extends ToneAudioWorkletProcessor {
  constructor(options) {
    super(
      Object.assign(options, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
      }),
    );
    this.params = {};
  }

  generate() {}

  updateParams(parameters, index) {
    for (const paramName in parameters) {
      const param = parameters[paramName];
      this.params[paramName] = param.length > 1 ? param[index] : param[0];
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const channelCount = Math.max((input && input.length) || 0, output.length);
    for (let sample = 0; sample < this.blockSize; sample++) {
      this.updateParams(parameters, sample);
      for (let channel = 0; channel < channelCount; channel++) {
        const inputSample = input && input.length ? input[channel][sample] : 0;
        output[channel][sample] = this.generate(inputSample, channel, this.params);
      }
    }
    return !this.disposed;
  }
}

class DelayLine {
  constructor(size, channels) {
    this.buffer = [];
    this.writeHead = [];
    this.size = size;
    for (let i = 0; i < channels; i++) {
      this.buffer[i] = new Float32Array(this.size);
      this.writeHead[i] = 0;
    }
  }

  push(channel, value) {
    this.writeHead[channel] += 1;
    if (this.writeHead[channel] > this.size) this.writeHead[channel] = 0;
    this.buffer[channel][this.writeHead[channel]] = value;
  }

  get(channel, delay) {
    let readHead = this.writeHead[channel] - Math.floor(delay);
    if (readHead < 0) readHead += this.size;
    return this.buffer[channel][readHead];
  }
}

class FeedbackCombFilterWorklet extends SingleIOProcessor {
  constructor(options) {
    super(options);
    this.delayLine = new DelayLine(this.sampleRate, options.channelCount || 2);
  }

  static get parameterDescriptors() {
    return [
      {
        name: "delayTime",
        defaultValue: 0.1,
        minValue: 0,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "feedback",
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 0.9999,
        automationRate: "k-rate",
      },
    ];
  }

  generate(input, channel, parameters) {
    const delayedSample = this.delayLine.get(channel, parameters.delayTime * this.sampleRate);
    this.delayLine.push(channel, input + delayedSample * parameters.feedback);
    return delayedSample;
  }
}

registerProcessor("feedback-comb-filter", FeedbackCombFilterWorklet);
