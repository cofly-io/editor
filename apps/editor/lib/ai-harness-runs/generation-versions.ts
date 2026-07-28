/**
 * Version constants recorded on every generation run — stage 6,
 * acceptance criterion 5: "运行事件包含 Prompt/API/示例集版本".
 *
 * Dashboards group success metrics by (model, category, apiVersion);
 * these constants make the prompt/DSL side of that join possible.
 * Bump PRIMITIVE_PROMPT_VERSION whenever PRIMITIVE_STAGE1/STAGE2 or the
 * registry capability summary changes materially.
 */

import { DSL_API_VERSION } from '@pascal-app/core/lib/generated-geometry-dsl-contract'

/** Version of the primitive stage1/stage2 system prompts. */
export const PRIMITIVE_PROMPT_VERSION = '1.2.0'

/** Re-exported so run events import all versions from one place. */
export { DSL_API_VERSION }

/** Bundle written into run metrics + route-metrics events. */
export const GENERATION_VERSIONS = {
  promptVersion: PRIMITIVE_PROMPT_VERSION,
  dslApiVersion: DSL_API_VERSION,
} as const
