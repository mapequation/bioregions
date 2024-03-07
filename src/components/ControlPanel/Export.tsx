import { Button, VStack } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import type RootStore from '../../store/RootStore';
import { saveBlob, saveCanvas, saveString } from '../../utils/exporter';
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
    saveString(`${parameterName}_presence-absence-per-cell.txt`, data);
  };

  const downloadPresenceAbsencePerBioregion = async () => {
    const data = speciesStore.generatePresenceAbsenceDataPerBioregion();
    saveString(`${parameterName}_presence-absence-per-bioregion.txt`, data);
  };

  const downloadSummaryTables = async () => {
    const data = speciesStore.generateSummaryTabularDataPerBioregion();
    saveString(`${parameterName}_summary_tables.tsv`, data);
  };

  type DownloadItem = {
    title: string;
    description?: string;
    onClick: () => void;
    isDisabled: boolean;
    hide?: boolean;
  };
  const downloadItems: DownloadItem[] = [
    {
      title: 'Map',
      onClick: downloadMap,
      isDisabled: false,
    },
    {
      title: 'Shapefile',
      onClick: downloadShapefile,
      isDisabled: !infomapStore.network,
    },
    {
      title: 'GeoJSON',
      onClick: downloadGeojson,
      isDisabled: !infomapStore.network,
    },
    {
      title: 'Presence/Absence per cell',
      description: 'Species presence/absence matrix',
      onClick: downloadPresenceAbsencePerCell,
      isDisabled: !infomapStore.network,
    },
    {
      title: 'Presence/Absence per bioregion',
      description: 'Species presence/absence matrix',
      onClick: downloadPresenceAbsencePerBioregion,
      isDisabled: !infomapStore.tree,
    },
    {
      title: 'Summary tables',
      description: 'Most common and indicative species per bioregion',
      onClick: downloadSummaryTables,
      isDisabled: !infomapStore.tree,
    },
    {
      title: 'Infomap tree',
      onClick: downloadInfomapTree,
      isDisabled: !infomapStore.treeString,
    },
    {
      title: 'Infomap output',
      onClick: downloadInfomapOutput,
      isDisabled: !infomapStore.tree,
    },
    {
      title: 'Network',
      onClick: downloadNetwork,
      isDisabled: !infomapStore.network,
    },
    {
      title: 'Multilayer network',
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
            title={item.description}
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
