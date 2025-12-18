import { observer } from 'mobx-react';
import {
  Box,
  VStack,
  Spacer,
  Tag,
  Button,
  Flex,
  Collapsible,
  Field,
} from '@chakra-ui/react';
import { format } from 'd3-format';
import DemoTree from './DemoTree';
import { useDemoStore } from '../../store';
import Stat from '../Stat';
import { useRef, useState } from 'react';
import NetworkSize from '../ControlPanel/NetworkSize';
import Modal from '../ControlPanel/Modal';
import Export from '../ControlPanel/Export';
// import TreeHistogram from '../TreeHistogram';
import DualTreeHistogram from '../DualTreeHistogram';
// import PhylocanvasTree from '../Tree';
// import TreeHistogram from '../TreeHistogram';
import { saveSvg } from '../../utils/exporter';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { NumberInputField, NumberInputRoot } from '../ui/number-input';

export default observer(() => {
  const demoStore = useDemoStore();
  const [beta, setBeta] = useState(0.75);
  const [segregateBranches, setSegregateBranches] = useState(false);
  const [segregationTimeBackup, setSegregationTimeBackup] = useState(0.0);
  const [isInfomapOutputOpen, setIsInfomapOutputOpen] = useState(false);
  const [crop, setCrop] = useState(false);
  const { treeStore, infomapStore, speciesStore, mapStore } = demoStore;
  const { tree } = treeStore;
  const svgRef = useRef<SVGSVGElement>(null);

  if (!tree || !speciesStore.loaded) {
    return null;
  }

  const _saveSvg = () => {
    if (!svgRef.current) {
      return;
    }

    // const svg = svgRef.current;
    // const vb = svg.viewBox.baseVal;
    // const croppedViewbox = {x: vb.x, y: vb.y - 4, width: vb.width, height: vb.height - 40 } as DOMRect;
    // svg.viewBox.baseVal = croppedViewbox;
    let svgContent = svgRef.current.outerHTML;

    // let svgContent = $svg.parent().html();
    // // console.log("svgContent before:", svgContent.substring(0, 250));
    svgContent = svgContent.replace(
      /^<svg/,
      [
        '<svg',
        'xmlns="http://www.w3.org/2000/svg"',
        'xmlns:xlink="http://www.w3.org/1999/xlink"',
        'version="1.1"',
      ].join(' '),
    );
    // Safari inserts NS1/NS2 namespaces as xlink is not defined within the svg html
    svgContent = svgContent.replace('NS1', 'xlink');
    svgContent = svgContent.replace('NS2', 'xlink');

    console.log(svgContent);

    saveSvg('bioregions-demo.svg', svgContent);
  };

  const onClickSaveSvg = () => {
    if (!svgRef.current) {
      return;
    }
    setCrop(true);
    setTimeout(() => {
      _saveSvg();
      setCrop(false);
    }, 100);
  };

  const runMultilayerInfomap = async () => {
    if (infomapStore.isRunning) {
      infomapStore.abort();
      return;
    }

    await infomapStore.runMultilayer();
    // console.log('Multilayer network:');
    // const net = infomapStore.multilayerNetwork!;
    // const treeNodesByLayer: Map<number, string[]> = new Map();
    // net.intra.forEach(({ layerId, source, target, weight }) => {
    //   const nodes = treeNodesByLayer.get(layerId) ?? [];
    //   if (nodes.length === 0) {
    //     treeNodesByLayer.set(layerId, nodes);
    //   }
    //   const sourceName = net.nodes![source].name; // tree node
    //   const targetName = net.nodes![target].name; // grid cell
    //   console.log(
    //     `Layer ${layerId}: ${sourceName} - ${targetName}, weight: ${weight}`,
    //   );
    // });
  };

  const { integrationTime, segregationTime, network } = infomapStore;
  const formatCodelength = format('.4f');
  const formatPercent = format('.3p');

  const showDeveloperStuff = false;
  const hideIntegration =
    infomapStore.useWholeTree || infomapStore.treeWeightBalance == 0;

  return (
    <Box>
      <Box w="60%" pos="relative">
        <DemoTree
          beta={beta}
          hideTree={!infomapStore.includeTreeInNetwork}
          hideSegregation={!segregateBranches}
          hideIntegration={hideIntegration}
          svgRef={svgRef}
          crop={crop}
        />
        <Box pos="relative" top={-24} mb={-24}>
          {!hideIntegration && (
            <Slider
              w={`${100 * (100 / 144)}%`}
              ml={`${400 / 144}%`}
              thumbAlignment="center"
              // isReversed
              origin="start" // TODO: should support 'end'
              min={0}
              max={1}
              step={0.01}
              value={[integrationTime]}
              onValueChange={(e) => infomapStore.setIntegrationTime(e.value[0])}
              onValueChangeEnd={(e) => {
                infomapStore.setIntegrationTime(e.value[0], true);
                infomapStore.run();
              }}
              colorScheme="blue"
            />
          )}
          {segregateBranches && (
            <Slider
              w={`${100 * (100 / 144)}%`}
              ml={`${400 / 144}%`}
              thumbAlignment="center"
              min={0}
              max={1}
              step={0.01}
              value={[segregationTime]}
              onValueChange={(e) => infomapStore.setSegregationTime(e.value[0])}
              onValueChangeEnd={(e) => {
                infomapStore.setSegregationTime(e.value[0], true);
                infomapStore.run();
              }}
              colorScheme="red"
            ></Slider>
          )}
        </Box>
      </Box>

      <Flex
        mt={4}
        direction={['column-reverse', null, 'row']}
        maxW={750}
        justify="space-between"
      >
        <VStack w={350} align="start">
          <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
            <Field.Label htmlFor="treeWeightBalance" mb="0">
              Relative tree strength
            </Field.Label>
            <Spacer />
            <Slider
              id="treeWeightBalance"
              w="30%"
              disabled={!infomapStore.includeTreeInNetwork}
              // focusThumbOnChange={false}
              value={[infomapStore.treeWeightBalance]}
              onValueChange={(e) =>
                infomapStore.setTreeWeightBalance(e.value[0])
              }
              onValueChangeEnd={(e) => {
                infomapStore.setTreeWeightBalance(e.value[0], true);
                infomapStore.run();
              }}
              min={0}
              max={1}
              step={0.01}
            ></Slider>
            <Tag.Root size="sm" ml={4}>
              <Tag.Label>
                {format('.2~p')(infomapStore.treeWeightBalance)}
              </Tag.Label>
            </Tag.Root>
          </Field.Root>
          <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
            <Field.Label htmlFor="includeTree" mb="0">
              Include tree
            </Field.Label>
            <Spacer />
            <Switch
              id="includeTree"
              checked={infomapStore.includeTreeInNetwork}
              onCheckedChange={() => {
                infomapStore.setIncludeTree(!infomapStore.includeTreeInNetwork);
                infomapStore.run();
              }}
            />
          </Field.Root>
          <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
            <Field.Label htmlFor="useWholeTree" mb="0">
              Integrate whole tree
            </Field.Label>
            <Spacer />
            <Switch
              id="useWholeTree"
              checked={infomapStore.useWholeTree}
              onCheckedChange={() => {
                infomapStore.setUseWholeTree(!infomapStore.useWholeTree, true);
                infomapStore.run();
              }}
            />
          </Field.Root>
          <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
            <Field.Label htmlFor="segregateBranches" mb="0">
              Segregate branches
            </Field.Label>
            <Spacer />
            <Switch
              id="segregateBranches"
              checked={segregateBranches}
              onCheckedChange={() => {
                if (segregateBranches) {
                  setSegregationTimeBackup(infomapStore.segregationTime);
                  infomapStore.setSegregationTime(0, true);
                  infomapStore.run();
                } else {
                  infomapStore.setSegregationTime(segregationTimeBackup, true);
                  infomapStore.run();
                }
                setSegregateBranches(!segregateBranches);
              }}
            />
          </Field.Root>
          <VStack w="100%" align="stretch" gap={2}>
            <VStack w="100%" align="stretch">
              <NetworkSize network={network} />
              <Stat label="Levels">{infomapStore.numLevels}</Stat>
              <Stat label="Bioregions">{infomapStore.numBioregions}</Stat>
              <Stat label="Codelength">
                {formatCodelength(infomapStore.codelength)} bits
              </Stat>
              <Stat label="Codelength savings">
                {formatPercent(infomapStore.relativeCodelengthSavings)}
              </Stat>
            </VStack>
          </VStack>
        </VStack>

        <Box alignSelf="start">
          <DualTreeHistogram
            dataLeft={treeStore.lineagesThroughTime}
            dataRight={infomapStore.linkWeightThroughTime}
            formatTime={treeStore.timeFormatter}
            isDisabled={!infomapStore.network}
            labelLeft="Lineages through time"
            labelRight="Accumulated link weight"
            yScaleRight="linear"
            stepRight={false}
            yTickFormatRight=".2~p"
          />
          {/* {treeStore.treeString != null && infomapStore.haveBioregions && (
            <PhylocanvasTree
              source={treeStore.treeString}
              size={{ width: 600, height: 400 }}
              showLabels
              showLeafLabels
              interactive
              nodeSize={20}
              styleNodeEdges={true}
              // fillColour={treeColor}
              // strokeColour={treeColor}
              // fontColour={treeColor}
              styles={treeStore.nodeStyles}
            />
          )} */}
        </Box>
      </Flex>

      <VStack mt={4} maxW={350} align="start">
        {showDeveloperStuff && (
          <>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="alwaysUseStateNetwork" mb="0">
                Always use state network
              </Field.Label>
              <Spacer />
              <Switch
                id="alwaysUseStateNetwork"
                checked={infomapStore.alwaysUseStateNetwork}
                onCheckedChange={() => {
                  infomapStore.setAlwaysUseStateNetwork(
                    !infomapStore.alwaysUseStateNetwork,
                  );
                  infomapStore.run();
                }}
              />
            </Field.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="uniformTreeLinks" mb="0">
                Uniform tree links
              </Field.Label>
              <Spacer />
              <Switch
                id="uniformTreeLinks"
                checked={infomapStore.uniformTreeLinks}
                onCheckedChange={() => {
                  infomapStore.setUniformTreeLinks(
                    !infomapStore.uniformTreeLinks,
                    true,
                  );
                  infomapStore.run();
                }}
              />
            </Field.Root>
            <Field.Root
              display="flex"
              flexDir="row"
              w="100%"
              alignItems="center"
            >
              <Field.Label htmlFor="curveBundleBeta" mb="0">
                Curve bundle strength
              </Field.Label>
              <Spacer />
              <Slider
                id="curveBundleBeta"
                w="30%"
                disabled={infomapStore.integrationTime === 1}
                // focusThumbOnChange={false}
                value={[beta]}
                onValueChange={(e) => setBeta(e.value[0])}
                min={0}
                max={1}
                step={0.01}
              ></Slider>
              <Tag.Root size="sm" ml={4}>
                <Tag.Label>{beta}</Tag.Label>
              </Tag.Root>
            </Field.Root>
          </>
        )}

        {!infomapStore.useWholeTree && (
          <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
            <Field.Label htmlFor="useWeightedTreeNodeLinksIfTimeSlice" mb="0">
              Weighted tree links
            </Field.Label>
            <Spacer />
            <Switch
              id="useWeightedTreeNodeLinksIfTimeSlice"
              checked={infomapStore.useWeightedTreeNodeLinksIfTimeSlice}
              onCheckedChange={() => {
                infomapStore.setUseWeightedTreeNodeLinksIfTimeSlice(
                  !infomapStore.useWeightedTreeNodeLinksIfTimeSlice,
                  true,
                );
                infomapStore.run();
              }}
            />
          </Field.Root>
        )}

        <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
          <Field.Label htmlFor="moduleLevel" mb="0">
            Module level
          </Field.Label>
          <Spacer />
          <Slider
            id="moduleLevel"
            w={100}
            // focusThumbOnChange={false}
            value={[infomapStore.moduleLevel]}
            onValueChange={(e) => infomapStore.setModuleLevel(e.value[0])}
            onValueChangeEnd={(e) => {
              infomapStore.setModuleLevel(e.value[0], true);
              infomapStore.run();
            }}
            min={0}
            max={Math.max(0, infomapStore.numLevels - 2)}
            step={1}
          ></Slider>
          <Tag.Root size="sm" ml={4} w={10}>
            <Tag.Label>{infomapStore.moduleLevel}</Tag.Label>
          </Tag.Root>
        </Field.Root>

        <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
          <Field.Label htmlFor="spatialNormalization" mb="0">
            Rarity strength
          </Field.Label>
          <Spacer />
          <Slider
            id="spatialNormalization"
            w={100}
            // focusThumbOnChange={false}
            value={[infomapStore.spatialNormalizationOrder]}
            onValueChange={(e) =>
              infomapStore.setSpatialNormalizationOrder(e.value[0])
            }
            onValueChangeEnd={(e) => {
              infomapStore.setSpatialNormalizationOrder(e.value[0], true);
              infomapStore.run();
            }}
            min={0}
            max={3}
            step={0.1}
          ></Slider>
          <Tag.Root size="sm" ml={4} w={10}>
            <Tag.Label>{infomapStore.spatialNormalizationOrder}</Tag.Label>
          </Tag.Root>
        </Field.Root>

        <Field.Root display="flex" flexDir="row" w="100%" alignItems="center">
          <Field.Label htmlFor="colorModuleParticipation" mb="0">
            Show inter-connected bioregions
          </Field.Label>
          <Spacer />
          <Switch
            id="colorModuleParticipation"
            checked={mapStore.colorModuleParticipation}
            onCheckedChange={() =>
              mapStore.setColorModuleParticipation(
                !mapStore.colorModuleParticipation,
              )
            }
          />
        </Field.Root>

        <Collapsible.Root
          open={mapStore.colorModuleParticipation}
          style={{ width: '100%', marginTop: 0 }}
        >
          <Collapsible.Content>
            <Flex w="100%" pl="10px" py={2}>
              <Box minW="100px" fontSize="0.9rem">
                Strength
              </Box>
              <Slider
                mx={3}
                disabled={!mapStore.colorModuleParticipation}
                // focusThumbOnChange={false}
                value={[mapStore.colorModuleParticipationStrength]}
                onValueChange={(e) =>
                  mapStore.setColorModuleParticipationStrength(e.value[0])
                }
                onValueChangeEnd={(e) =>
                  mapStore.setColorModuleParticipationStrength(e.value[0], true)
                }
                min={0}
                max={1}
                step={0.1}
              ></Slider>
              <Tag.Root size="sm" minW={50}>
                <Tag.Label>
                  {mapStore.colorModuleParticipationStrength}
                </Tag.Label>
              </Tag.Root>
            </Flex>
          </Collapsible.Content>
        </Collapsible.Root>

        <Button onClick={() => setIsInfomapOutputOpen(true)}>
          Infomap console
        </Button>

        <Field.Root
          display="flex"
          flexDir="row"
          w="100%"
          alignItems="center"
          disabled={infomapStore.isRunning}
        >
          <Field.Label mb="0">
            <Button
              size="sm"
              w="100%"
              colorScheme={infomapStore.isRunning ? 'red' : 'gray'}
              variant={infomapStore.isRunning ? 'outline' : 'solid'}
              onClick={runMultilayerInfomap}
              disabled={!infomapStore.network}
            >
              {!infomapStore.isRunning ? 'Run multilayer' : 'Abort'}
            </Button>
          </Field.Label>
          <Spacer />
          <NumberInputRoot
            maxW="70px"
            min={2}
            size="xs"
            value={`${infomapStore.numLayers}`}
            onValueChange={(e) => infomapStore.setNumLayers(+e.value)}
          >
            <NumberInputField />
          </NumberInputRoot>
        </Field.Root>

        <Modal
          header="Infomap output"
          open={isInfomapOutputOpen}
          onOpenChange={(e) => setIsInfomapOutputOpen(e.open)}
          scrollBehavior="inside"
          size="xl"
        >
          <Box maxW="50%" fontSize="0.8rem">
            <pre>
              {infomapStore.infomapOutput ||
                'Load data and run Infomap to see output here'}
            </pre>
          </Box>
        </Modal>

        <Export rootStore={demoStore} />
        <Button onClick={onClickSaveSvg}>Save svg</Button>
      </VStack>
    </Box>
  );
});
