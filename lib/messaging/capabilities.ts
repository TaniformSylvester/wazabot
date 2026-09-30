import type { MessageType } from "@/lib/messaging/types";

/**
 * Which message types the assistant processes end to end.
 *
 *   text      — processed by the AI pipeline (MVP).
 *   audio     — architecture ready: stored + schema for transcripts; needs a speech-to-text provider.
 *   image     — architecture ready: stored + schema for analyses; needs catalog (Phase 3) + vision turn wiring.
 *   document / video / location — stored and shown to the team; not processed by the AI.
 *
 * Flip audio/image to true only once their provider and tests exist.
 */
export type Capabilities = Record<MessageType, boolean>;

export const MVP_CAPABILITIES: Capabilities = {
  text: true,
  audio: false,
  image: false,
  document: false,
  video: false,
  location: false,
};
