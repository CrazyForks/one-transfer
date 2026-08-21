// How much payload fits in a stream at a given frame size.
//
// The frame header numbers source blocks in a u16, so every bytes-per-frame
// profile has a different ceiling. The sender derives its file limit from that
// ceiling instead of maintaining a second fixed number.

import {
  FILE_CONTAINER_HEADER_LEN,
  HEADER_LEN,
  MAX_FILE_NAME_BYTES,
  MAX_MEDIA_TYPE_BYTES,
} from "./protocol";

/** `k` is a u16 in the frame header. */
export const MAX_SOURCE_BLOCKS = 0xffff;

/** Payload bytes per frame, once the header has taken its cut. */
export function blockLength(frameBytes: number): number {
  return frameBytes - HEADER_LEN;
}

/** Source blocks a payload splits into at this frame size. */
export function sourceBlockCount(payloadBytes: number, frameBytes: number): number {
  return Math.ceil(payloadBytes / blockLength(frameBytes));
}

export function fitsInOneStream(payloadBytes: number, frameBytes: number): boolean {
  return sourceBlockCount(payloadBytes, frameBytes) <= MAX_SOURCE_BLOCKS;
}

/** Largest complete container that the frame profile can address. */
export function maximumStreamPayloadBytes(frameBytes: number): number {
  return MAX_SOURCE_BLOCKS * blockLength(frameBytes);
}

/**
 * Conservative original-file limit for a profile. Reserve the maximum encoded
 * filename and media type so every file accepted by the label is guaranteed to
 * fit, even when gzip does not reduce it.
 */
export function maximumFileBytes(frameBytes: number): number {
  return Math.max(
    0,
    maximumStreamPayloadBytes(frameBytes) -
      FILE_CONTAINER_HEADER_LEN -
      MAX_FILE_NAME_BYTES -
      MAX_MEDIA_TYPE_BYTES,
  );
}

/** The smallest bytes-per-frame that can carry this payload at all. */
export function minimumFrameBytes(payloadBytes: number): number {
  return Math.ceil(payloadBytes / MAX_SOURCE_BLOCKS) + HEADER_LEN;
}

/**
 * The smallest offered setting that works, so the sender can name a value that
 * is actually in the dropdown instead of the bare arithmetic minimum.
 *
 * Undefined when no offered option is large enough.
 */
export function smallestSufficientFrameSize(
  payloadBytes: number,
  options: readonly number[],
): number | undefined {
  const minimum = minimumFrameBytes(payloadBytes);
  return options
    .filter((value) => value >= minimum)
    .sort((a, b) => a - b)[0];
}
