/**
 * Web Worker for calculating image histogram
 * Offloads CPU-intensive pixel processing from the main thread
 */

export interface HistogramWorkerMessage {
  imageData: ImageData;
}

export interface HistogramWorkerResult {
  histogram: {
    red: number[];
    green: number[];
    blue: number[];
    luminance: number[];
  };
}

self.onmessage = (e: MessageEvent<HistogramWorkerMessage>) => {
  const { imageData } = e.data;
  const { data } = imageData;

  const histogram = {
    red: new Array(256).fill(0),
    green: new Array(256).fill(0),
    blue: new Array(256).fill(0),
    luminance: new Array(256).fill(0),
  };

  // Calculate histogram by iterating through pixels
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    histogram.red[r]++;
    histogram.green[g]++;
    histogram.blue[b]++;

    // Calculate luminance using ITU-R BT.709 formula
    const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    histogram.luminance[lum]++;
  }

  const result: HistogramWorkerResult = { histogram };
  self.postMessage(result);
};
