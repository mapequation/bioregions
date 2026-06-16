import { observer } from 'mobx-react';
import type { ReactElement } from 'react';
import { useStore } from '../../store';
import type { LayoutMode, CurveMode, SizeMode } from '../../utils/tree/treeLayout';
import type { BackendType } from '@mapequation/d3gl/map';
import { BACKENDS } from '../../store/MapStore';
import { StatusBar, StatusGroup, StatusButton, StatusDivider } from './StatusBar';
import StatusBarSettings from './StatusBarSettings';
import {
  LayoutRectangularIcon,
  LayoutRadialIcon,
  LinkLinearIcon,
  LinkStepIcon,
  LinkBumpIcon,
  CoordsWorldIcon,
  CoordsScreenIcon,
} from './icons';

const BACKEND_LABEL: Record<string, string> = { auto: 'GL', canvas: '2D', svg: 'SVG' };
const BACKEND_HELP: Record<string, string> = {
  auto: 'WebGL — GPU rendering',
  canvas: 'Canvas 2D',
  svg: 'SVG — vector output',
};

const LAYOUTS: { value: LayoutMode; icon: ReactElement; help: string }[] = [
  { value: 'rectangular', icon: <LayoutRectangularIcon />, help: 'Rectangular — dated phylogram' },
  { value: 'radial', icon: <LayoutRadialIcon />, help: 'Radial — half-circle fan' },
];
const CURVES: { value: CurveMode; icon: ReactElement; help: string }[] = [
  { value: 'linear', icon: <LinkLinearIcon />, help: 'Linear — straight branches' },
  { value: 'step', icon: <LinkStepIcon />, help: 'Step — right-angle elbows' },
  { value: 'bump', icon: <LinkBumpIcon />, help: 'Bump — smooth curves' },
];
const COORDS: { value: SizeMode; icon: ReactElement; help: string }[] = [
  { value: 'world', icon: <CoordsWorldIcon />, help: 'World — node pies scale with clade & zoom' },
  { value: 'screen', icon: <CoordsScreenIcon />, help: 'Screen — fixed-size node pies (declutter on zoom)' },
];

export default observer(function TreeStatusBar() {
  const { treeStore, settingsStore } = useStore();
  return (
    <StatusBar showLabels={settingsStore.showStatusBarLabels}>
      <StatusGroup caption="backend">
        {BACKENDS.map((b: BackendType) => (
          <StatusButton
            key={b}
            active={treeStore.backend === b}
            content={BACKEND_HELP[b]}
            onClick={() => treeStore.setBackend(b)}
          >
            {BACKEND_LABEL[b]}
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusDivider />

      <StatusGroup caption="layout">
        {LAYOUTS.map((o) => (
          <StatusButton
            key={o.value}
            active={treeStore.layout === o.value}
            content={o.help}
            onClick={() => treeStore.setLayout(o.value)}
          >
            {o.icon}
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusGroup caption="links">
        {CURVES.map((o) => (
          <StatusButton
            key={o.value}
            active={treeStore.curve === o.value}
            content={o.help}
            onClick={() => treeStore.setCurve(o.value)}
          >
            {o.icon}
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusGroup caption="coords">
        {COORDS.map((o) => (
          <StatusButton
            key={o.value}
            active={treeStore.coords === o.value}
            content={o.help}
            onClick={() => treeStore.setCoords(o.value)}
          >
            {o.icon}
          </StatusButton>
        ))}
      </StatusGroup>

      <StatusBarSettings />
    </StatusBar>
  );
});
