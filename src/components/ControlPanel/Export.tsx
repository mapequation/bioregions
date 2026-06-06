import { Button, VStack } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '../../store';
import type RootStore from '../../store/RootStore';
import { saveBlob, stringToBlob } from '../../utils/exporter';
import JSZip from 'jszip';
//@ts-ignore
import shpWrite from 'shp-write';

interface ExportProps {
  rootStore?: RootStore;
}

type DownloadItem = {
  title: string;
  /** Optional button text (defaults to `title`); used to show the dynamic image extension. */
  label?: string;
  description?: string;
  extension: string;
  getBlob: () => Promise<Blob>;
  disabled: boolean;
  hide?: boolean;
};

export default observer(function Export({ rootStore }: ExportProps) {
  const _rootStore = useStore();
  const { infomapStore, mapStore, speciesStore, treeStore } =
    rootStore ?? _rootStore;
  const { parameterName } = infomapStore;

  const download = async (item: DownloadItem) => {
    const filename = `${parameterName}${item.extension}`;
    const blob = await item.getBlob();
    saveBlob(filename, blob);
  };

  const downloadItems: DownloadItem[] = [
    {
      title: 'Map',
      label: `Map (${mapStore.imageExtension})`,
      extension: mapStore.imageExtension,
      disabled: false,
      getBlob: async () => mapStore.getImageBlob(),
    },
    {
      title: 'Phylogenetic tree',
      label: `Phylogenetic tree (${treeStore.imageExtension})`,
      extension: `_tree${treeStore.imageExtension}`,
      disabled: !treeStore.haveTree,
      hide: !treeStore.haveTree,
      getBlob: async () => treeStore.getImageBlob(),
    },
    {
      title: 'Shapefile',
      extension: '.zip',
      disabled: !infomapStore.network,
      getBlob: async () => {
        const geojson = speciesStore.generateGeojsonFromBins();
        const shpOptions = {
          folder: parameterName,
          types: {
            polygon: parameterName,
          },
        };
        return shpWrite.zip(geojson, shpOptions, { type: 'blob' });
      },
    },
    {
      title: 'GeoJSON',
      extension: '.geojson',
      disabled: !infomapStore.network,
      getBlob: async () => {
        const geojson = speciesStore.generateGeojsonFromBins();
        const data = JSON.stringify(geojson);
        return stringToBlob(data);
      },
    },
    {
      title: 'Presence/Absence per cell',
      description: 'Species presence/absence matrix',
      extension: '_presence-absence-per-cell.txt',
      disabled: !infomapStore.network,
      getBlob: async () => {
        const data = speciesStore.generatePresenceAbsenceDataPerCell();
        return stringToBlob(data);
      },
    },
    {
      title: 'Presence/Absence per bioregion',
      description: 'Species presence/absence for each bioregion',
      extension: '_presence-absence-per-bioregion.txt',
      disabled: !infomapStore.tree,
      getBlob: async () => {
        const data = speciesStore.generatePresenceAbsenceDataPerBioregion();
        return stringToBlob(data);
      },
    },
    {
      title: 'Summary tables',
      description: 'Most common and indicative species per bioregion',
      extension: '_summary_tables.tsv',
      disabled: !infomapStore.tree,
      getBlob: async () => {
        const data = speciesStore.generateSummaryTabularDataPerBioregion();
        return stringToBlob(data);
      },
    },
    {
      title: 'Full tables',
      description: 'All species per bioregion with common and indicative score',
      extension: '_full_tables.tsv',
      disabled: !infomapStore.tree,
      getBlob: async () => {
        const data = speciesStore.generateFullTabularDataPerBioregion();
        return stringToBlob(data);
      },
    },
    {
      title: 'Infomap tree',
      extension: '.treee',
      disabled: !infomapStore.treeString,
      getBlob: async () => {
        return stringToBlob(infomapStore.treeString!);
      },
    },
    {
      title: 'Infomap output',
      extension: `${infomapStore.haveStateNodes ? '_states' : ''}.json`,
      disabled: !infomapStore.tree,
      getBlob: async () => {
        return stringToBlob(JSON.stringify(infomapStore.tree));
      },
    },
    {
      title: 'Network',
      extension: `${infomapStore.haveStateNodes ? '_states' : ''}.net`,
      disabled: !infomapStore.network,
      getBlob: async () => {
        return stringToBlob(infomapStore.serializeNetwork() ?? '');
      },
    },
    {
      title: 'Multilayer network',
      extension: '_intra.net',
      getBlob: async () => {
        return stringToBlob(infomapStore.serializeMultilayerNetwork() ?? '');
      },
      disabled: !infomapStore.multilayerNetwork,
      hide: !infomapStore.multilayerNetwork,
    },
  ];
  const downloadAllItem: DownloadItem = {
    title: 'All',
    description: 'Downlaod all enabled files,',
    extension: '_all.zip',
    disabled: false,
    getBlob: async () => {
      const zip = new JSZip();
      for (const item of downloadItems) {
        if (item.disabled) continue;
        const filename = `${parameterName}${item.extension}`;
        const blob = await item.getBlob();
        zip.file(filename, blob);
      }
      const zipFile = await zip.generateAsync({ type: 'blob' });
      return zipFile;
    },
  };
  const downloadItemsAll = [...downloadItems, downloadAllItem];

  return (
    <VStack align="stretch">
      {downloadItemsAll
        .filter((item) => !item.hide)
        .map((item) => (
          <Button
            key={item.title}
            title={item.description}
            size="sm"
            disabled={item.disabled}
            onClick={() => download(item)}
          >
            {item.label ?? item.title}
          </Button>
        ))}
    </VStack>
  );
});
