import { Button, VStack } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import type RootStore from '../../store/RootStore';
import {
  saveBase64,
  saveBlob,
  saveCanvas,
  saveString,
} from '../../utils/exporter';
//@ts-ignore
import shpWrite from 'shp-write';

interface ExportProps {
  rootStore?: RootStore;
}

export default observer(function Export({ rootStore }: ExportProps) {
  const _rootStore = useStore();
  const { infomapStore, mapStore, speciesStore } = rootStore ?? _rootStore;
  const { parameterName } = infomapStore;

  const downloadMap = () => {
    saveCanvas(mapStore.canvas!, `${parameterName}.png`);
  };

  const downloadInfomapTree = () => {
    if (!infomapStore.treeString) return;

    const filename = `${parameterName}.tree`;
    saveString(filename, infomapStore.treeString);
  };

  const downloadInfomapOutput = () => {
    if (!infomapStore.tree) return;

    const suffix = infomapStore.haveStateNodes ? '_states' : '';
    const filename = `${parameterName}${suffix}.json`;
    saveString(filename, JSON.stringify(infomapStore.tree));
  };

  const downloadNetwork = () => {
    if (!infomapStore.network) return;

    const _states = infomapStore.haveStateNetwork ? `_states` : '';
    const filename = `${parameterName}${_states}.net`;
    saveString(filename, infomapStore.serializeNetwork() ?? '');
  };

  const downloadMultilayerNetwork = () => {
    if (!infomapStore.multilayerNetwork) return;

    const filename = `${parameterName}_intra.net`;
    saveString(filename, infomapStore.serializeMultilayerNetwork() ?? '');
  };

  const downloadShapefile = async () => {
    const geojson = speciesStore.generateGeojsonFromBins();
    const shpOptions = {
      folder: parameterName,
      types: {
        polygon: parameterName,
      },
    };
    const data = await shpWrite.zip(geojson, shpOptions, { type: 'blob' });
    saveBlob(`${parameterName}.zip`, data);
  };

  const downloadGeojson = async () => {
    const geojson = speciesStore.generateGeojsonFromBins();
    const data = JSON.stringify(geojson);
    saveString(`${parameterName}.geojson`, data);
  };

  const downloadPresenceAbsencePerCell = async () => {
    const data = speciesStore.generatePresenceAbsenceDataPerCell();
    saveString(`${parameterName}_presence-absence.txt`, data);
  };

  type DownloadItem = {
    title: string;
    onClick: () => void;
    isDisabled: boolean;
    hide?: boolean;
  };
  const downloadItems: DownloadItem[] = [
    {
      title: 'Download map',
      onClick: downloadMap,
      isDisabled: false,
    },
    {
      title: 'Download Shapefile',
      onClick: downloadShapefile,
      isDisabled: !infomapStore.network,
    },
    {
      title: 'Download GeoJSON',
      onClick: downloadGeojson,
      isDisabled: !infomapStore.network,
    },
    {
      title: 'Download Cell Presence/Absence',
      onClick: downloadPresenceAbsencePerCell,
      isDisabled: !infomapStore.network,
    },
    {
      title: 'Download Infomap tree',
      onClick: downloadInfomapTree,
      isDisabled: !infomapStore.treeString,
    },
    {
      title: 'Download Infomap output',
      onClick: downloadInfomapOutput,
      isDisabled: !infomapStore.tree,
    },
    {
      title: 'Download network',
      onClick: downloadNetwork,
      isDisabled: !infomapStore.network,
    },
    {
      title: 'Download multilayer network',
      onClick: downloadMultilayerNetwork,
      isDisabled: !infomapStore.multilayerNetwork,
      hide: !infomapStore.multilayerNetwork,
    },
  ];

  return (
    <VStack align="stretch">
      {downloadItems
        .filter((item) => !item.hide)
        .map((item) => (
          <Button
            key={item.title}
            size="sm"
            isDisabled={item.isDisabled}
            onClick={item.onClick}
          >
            {item.title}
          </Button>
        ))}
    </VStack>
  );
});
