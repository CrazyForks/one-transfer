import { DEFAULT_SPEED_PROFILE_INDEX, SEND_SPEED_PROFILES } from "./send-settings";

export interface DeviceCapabilities {
  logicalCores: number;
  deviceMemoryGiB?: number;
  refreshRateHz?: number;
  shortViewportEdge: number;
  devicePixelRatio?: number;
}

export interface SpeedRecommendation {
  profileIndex: number;
  explanation: string;
}

/**
 * Pick the fastest preset the sending device can reasonably render.
 * Unknown browser-restricted values do not count against the device; the
 * visible slider remains the escape hatch for receiver-side camera limits.
 */
export function recommendSpeedProfile(capabilities: DeviceCapabilities): SpeedRecommendation {
  const physicalShortEdge =
    capabilities.shortViewportEdge * Math.max(1, capabilities.devicePixelRatio ?? 1);
  const memorySupportsHigh =
    capabilities.deviceMemoryGiB === undefined || capabilities.deviceMemoryGiB >= 8;
  const refreshSupportsHigh =
    capabilities.refreshRateHz === undefined || capabilities.refreshRateHz >= 55;

  if (
    capabilities.logicalCores >= 8 &&
    memorySupportsHigh &&
    refreshSupportsHigh &&
    physicalShortEdge >= 1800
  ) {
    return {
      profileIndex: 2,
      explanation: "多核、显示刷新率与可用画面尺寸足以承担四码高密度播放",
    };
  }

  const memorySupportsBalanced =
    capabilities.deviceMemoryGiB === undefined || capabilities.deviceMemoryGiB >= 4;
  const refreshSupportsBalanced =
    capabilities.refreshRateHz === undefined || capabilities.refreshRateHz >= 45;
  if (
    capabilities.logicalCores >= 4 &&
    memorySupportsBalanced &&
    refreshSupportsBalanced &&
    physicalShortEdge >= 1024
  ) {
    return {
      profileIndex: 1,
      explanation: "配置适合默认四码传输，兼顾二维码密度与识别稳定性",
    };
  }

  return {
    profileIndex: 0,
    explanation: "核心数、刷新率或可用画面尺寸有限，优先保证二维码可识别性",
  };
}

export function describeDeviceCapabilities(capabilities: DeviceCapabilities): string {
  const facts = [`${capabilities.logicalCores} 线程`];
  if (capabilities.deviceMemoryGiB !== undefined) {
    facts.push(`${capabilities.deviceMemoryGiB} GiB 内存`);
  }
  if (capabilities.refreshRateHz !== undefined) {
    facts.push(`约 ${capabilities.refreshRateHz} Hz`);
  }
  facts.push(`画面短边 ${capabilities.shortViewportEdge}px`);
  if ((capabilities.devicePixelRatio ?? 1) > 1) {
    facts.push(`${capabilities.devicePixelRatio}× 像素密度`);
  }
  return facts.join(" · ");
}

export function recommendedProfileLabel(recommendation: SpeedRecommendation): string {
  return SEND_SPEED_PROFILES[recommendation.profileIndex]?.label ??
    SEND_SPEED_PROFILES[DEFAULT_SPEED_PROFILE_INDEX]!.label;
}
