import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { LAYER_LABELS } from '../analyzers/repo/catalog';
import { Icon } from '../components/Icon';
import { TechLogo, layerVar } from '../components/ui';
import type { Layer } from '../core/model';
import type { ArchNode } from './arch';

export type ArchNodeData = ArchNode & { dimmed: boolean; selected: boolean } & Record<string, unknown>;
export type BandData = { layer: Layer; w: number; h: number } & Record<string, unknown>;

const KIND_ICON: Record<string, string> = {
  module: 'folder', datastore: 'database', service: 'cloud', infra: 'server', thirdParty: 'globe', framework: 'box',
};

const TONE: Record<string, string> = { danger: 'var(--danger)', accent: 'var(--accent)', muted: 'var(--muted)' };

export const ArchCard = memo(function ArchCard({ data }: NodeProps & { data: ArchNodeData }) {
  const color = layerVar(data.layer);
  const dashed = data.confidence === 'inferred';
  return (
    <div
      className="group relative flex h-[64px] w-[220px] items-center gap-2.5 rounded-xl border px-3 transition-all duration-200"
      style={{
        background: 'color-mix(in srgb, var(--panel-solid) 92%, transparent)',
        borderColor: data.selected ? color : `color-mix(in srgb, ${color} ${dashed ? 55 : 30}%, transparent)`,
        borderStyle: dashed ? 'dashed' : 'solid',
        boxShadow: data.selected ? `0 0 0 1px ${color}, 0 0 28px -6px ${color}` : undefined,
        opacity: data.dimmed ? 0.18 : 1,
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0" style={{ background: color }} />
      <span className="absolute inset-y-2 left-0 w-[3px] rounded-r" style={{ background: color }} />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
        {data.logo ? <TechLogo slug={data.logo} name={data.label} size={17} /> : <Icon name={KIND_ICON[data.kind] ?? 'box'} size={16} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] font-medium ${data.kind === 'module' ? 'mono text-[12px]' : ''}`} title={data.label}>{data.label}</div>
        <div className="truncate text-[11px] text-faint" title={data.sub}>{data.sub}</div>
      </div>
      {data.badges.length > 0 && (
        <div className="absolute -right-2 -top-2 flex gap-1">
          {data.badges.map((b) => (
            <span key={b.label} className="mono rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: 'var(--panel-solid)', color: TONE[b.tone], border: `1px solid color-mix(in srgb, ${TONE[b.tone]} 50%, transparent)` }}>
              {b.label}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0" style={{ background: color }} />
    </div>
  );
});

export const LayerBand = memo(function LayerBand({ data }: NodeProps & { data: BandData }) {
  const color = layerVar(data.layer);
  return (
    <div
      className="pointer-events-none rounded-2xl border"
      style={{
        width: data.w,
        height: data.h,
        borderColor: `color-mix(in srgb, ${color} 18%, transparent)`,
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 7%, transparent), transparent 40%)`,
      }}
    >
      <div className="mono px-4 pt-3 text-[11px] uppercase tracking-[0.18em]" style={{ color }}>
        {LAYER_LABELS[data.layer]}
      </div>
    </div>
  );
});

export const nodeTypes = { arch: ArchCard, band: LayerBand };
