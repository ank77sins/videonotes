export type VideoQuality = "360p" | "720p" | "1080p" | "best";

export const VIDEO_QUALITIES: { value: VideoQuality; label: string }[] = [
  { value: "360p", label: "360p — smallest" },
  { value: "720p", label: "720p — balanced" },
  { value: "1080p", label: "1080p — full HD" },
  { value: "best", label: "Best available" },
];
