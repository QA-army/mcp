import * as z from 'zod/v4';
const fragmentId=z.string().regex(/^frg_[a-f0-9]{32}$/);
const binding=z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const position=z.number().int().min(0).max(49);
export const journeyComposition=z.strictObject({
  schema_version:z.literal('journey-composition.v1'),goal:z.string().min(1).max(2000),
  sources:z.array(z.strictObject({fragment_id:fragmentId,test_id:z.string().regex(/^tst_[a-f0-9]{32}$/),test_version:z.number().int().positive(),step_id:z.string().regex(/^stp_[a-f0-9]{32}$/),
    primitive:z.enum(['ACT','ASSERT','SCREENSHOT','LOGIN','FILES','JAVASCRIPT','MICROPHONE']),content_sha256:z.string().regex(/^[a-f0-9]{64}$/)})).min(1).max(24),
  steps:z.array(z.strictObject({position,source_fragment_ids:z.array(fragmentId).max(4),inferred_connection:z.string().min(1).max(500).nullable()})).min(1).max(50),
  bindings:z.array(z.strictObject({name:binding,source_position:position,query:z.string().min(1).max(500),value_type:z.enum(['string','number','boolean'])})).max(8),
  binding_checks:z.array(z.strictObject({position,binding,query:z.string().min(1).max(500)})).max(24),
  unresolved_prerequisites:z.array(z.string().min(1).max(500)).max(12),
}).describe('Versioned source citations and observed identity bindings. Preserve when editing a generated Test. The server checks authorization, ordering, source versions and completion; metadata does not prove a Run passed.');
