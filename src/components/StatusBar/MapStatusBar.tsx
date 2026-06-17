import { observer } from 'mobx-react';
import { useStore } from '../../store';
import { BACKENDS, PROJECTIONS, PROJECTIONNAME } from '../../store/MapStore';
import { StatusBar, StatusGroup, StatusButton, StatusDivider } from './StatusBar';
import StatusBarSettings from './StatusBarSettings';
import {
  bioregionIconColors,
  ProjectionIcon,
  RecordsIcon,
  HeatmapIcon,
  BioregionsIcon,
  BoundariesFuzzyIcon,
  ClipOnIcon,
  ResetViewIcon,
} from './icons';

const BACKEND_LABEL: Record<string, string> = { auto: 'GL', canvas: '2D', svg: 'SVG' };
const BACKEND_HELP: Record<string, string> = {
  auto: 'WebGL — GPU rendering, smooth globe & large data',
  canvas: 'Canvas 2D — paints the first frame sooner',
  svg: 'SVG — vector output, exportable',
};

export default observer(function MapStatusBar() {
  const { mapStore, infomapStore, colorStore, settingsStore } = useStore();
  const [r1, r2] = bioregionIconColors(colorStore);
  const isBioregions = mapStore.renderType === 'bioregions';
  const levelCount = infomapStore.numLevels - 1; // selectable levels (slider was 0..numLevels-2)

  return (
    <StatusBar showLabels={settingsStore.showStatusBarLabels}>
      <StatusGroup caption="backend">
        {BACKENDS.map((b) => (
          <StatusButton
            key={b}
            active={mapStore.backend === b}
            content={BACKEND_HELP[b]}
            onClick={() => mapStore.setBackend(b)}
          >
            {BACKEND_LABEL[b]}
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusDivider />

      <StatusGroup caption="projection">
        {PROJECTIONS.map((p) => (
          <StatusButton
            key={p}
            active={mapStore.projectionName === p}
            content={PROJECTIONNAME[p]}
            onClick={() => mapStore.setProjection(p)}
          >
            <ProjectionIcon name={p} />
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusGroup caption="show">
        <StatusButton
          active={mapStore.renderType === 'records'}
          content="Records — raw occurrence points"
          onClick={() => mapStore.setRenderType('records')}
        >
          <RecordsIcon />
        </StatusButton>
        <StatusButton
          active={mapStore.renderType === 'heatmap'}
          content="Heatmap — value per grid cell"
          onClick={() => mapStore.setRenderType('heatmap')}
        >
          <HeatmapIcon />
        </StatusButton>
        <StatusButton
          active={isBioregions}
          disabled={!infomapStore.haveBioregions}
          content={
            infomapStore.haveBioregions
              ? 'Bioregions — computed regions'
              : 'Bioregions — run Infomap first'
          }
          onClick={() => mapStore.setRenderType('bioregions')}
        >
          <BioregionsIcon r1={r1} r2={r2} />
        </StatusButton>
      </StatusGroup>

      {infomapStore.numLevels > 2 && (
        <StatusGroup caption="level">
          {Array.from({ length: levelCount }, (_, i) => i + 1).map((k) => (
            <StatusButton
              key={k}
              active={infomapStore.moduleLevel === k - 1}
              content={`Module level ${k}`}
              onClick={() => {
                infomapStore.setModuleLevel(k - 1, true);
                if (mapStore.renderType === 'bioregions') mapStore.render();
              }}
            >
              {k}
            </StatusButton>
          ))}
        </StatusGroup>
      )}

      <StatusGroup caption="boundaries">
        <StatusButton
          active={!mapStore.colorModuleParticipation}
          disabled={!isBioregions}
          content="Distinct — hard boundaries between bioregions"
          onClick={() => mapStore.setColorModuleParticipation(false)}
        >
          <BioregionsIcon r1={r1} r2={r2} />
        </StatusButton>
        <StatusButton
          active={mapStore.colorModuleParticipation}
          disabled={!isBioregions}
          content="Inter-connected — fuzzy transition zones between bioregions"
          onClick={() => mapStore.setColorModuleParticipation(true)}
        >
          <BoundariesFuzzyIcon r1={r1} r2={r2} />
        </StatusButton>
      </StatusGroup>

      <StatusGroup caption="clip">
        <StatusButton
          active={!mapStore.clipToLand}
          disabled={mapStore.renderType === 'records'}
          content="No clip — colors fill the ocean too"
          onClick={() => mapStore.setClipToLand(false)}
        >
          <BioregionsIcon r1={r1} r2={r2} />
        </StatusButton>
        <StatusButton
          active={mapStore.clipToLand}
          disabled={mapStore.renderType === 'records'}
          content="Clip to land — colors follow the coastline"
          onClick={() => mapStore.setClipToLand(true)}
        >
          <ClipOnIcon r1={r1} r2={r2} ocean={mapStore.waterColor} />
        </StatusButton>
      </StatusGroup>

      <StatusGroup caption="view">
        <StatusButton
          content="Reset view — pan, zoom & rotation"
          onClick={() => mapStore.resetView()}
        >
          <ResetViewIcon />
        </StatusButton>
      </StatusGroup>

      <StatusBarSettings />
    </StatusBar>
  );
});
