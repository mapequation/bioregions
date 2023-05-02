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

  return (
    <VStack align="stretch">
      <Button size="sm" onClick={downloadMap}>
        Download map
      </Button>
      <Button
        size="sm"
        isDisabled={!infomapStore.network}
        onClick={downloadShapefile}
      >
        Download Shapefile
      </Button>
      <Button
        size="sm"
        isDisabled={!infomapStore.network}
        onClick={downloadGeojson}
      >
        Download GeoJSON
      </Button>
      <Button
        size="sm"
        isDisabled={!infomapStore.treeString}
        onClick={downloadInfomapTree}
      >
        Download Infomap tree
      </Button>
      <Button
        size="sm"
        isDisabled={!infomapStore.tree}
        onClick={downloadInfomapOutput}
      >
        Download Infomap output
      </Button>
      <Button
        size="sm"
        isDisabled={!infomapStore.network}
        onClick={downloadNetwork}
      >
        Download network
      </Button>
      {infomapStore.multilayerNetwork && (
        <Button
          size="sm"
          isDisabled={!infomapStore.multilayerNetwork}
          onClick={downloadMultilayerNetwork}
        >
          Download multilayer network
        </Button>
      )}
    </VStack>
  );
});
