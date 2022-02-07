import { observer } from 'mobx-react';
import {
  Box,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  VStack,
  FormControl,
  FormLabel,
  Spacer,
  Tag,
  Switch,
} from '@chakra-ui/react';
import { format } from 'd3-format';
import DemoTree from './DemoTree';
import { useDemoStore } from '../../store';
import Stat from '../Stat';
import { useState } from 'react';

export default observer(() => {
  const demoStore = useDemoStore();
  const [beta, setBeta] = useState(0.75);
  const { treeStore, infomapStore } = demoStore;
  const { tree } = treeStore;

  if (!tree) {
    return null;
  }

  const { integrationTime, segregationTime, network } = infomapStore;
  const formatCodelength = format('.4f');
  const formatPercent = format('.1%');
  const numNodes = network?.nodes.length;
  const numLinks = network?.links.length;
  const numNodesFromTree = network?.numTreeNodes;
  const numLinksFromTree = network?.numTreeLinks;

  const showDeveloperStuff = false;

  return (
    <Box>
      <Box w="60%" pos="relative">
        <DemoTree beta={beta} />
        <Box pos="relative" top={-20} mb={-20}>
          <Slider
            w={`${100 * (100 / 144)}%`}
            ml={`${400 / 144}%`}
            min={0}
            max={1}
            step={0.01}
            value={segregationTime}
            onChange={infomapStore.setSegregationTime}
            onChangeEnd={(value) => {
              infomapStore.setSegregationTime(value, true);
              infomapStore.run();
            }}
            colorScheme="red"
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb />
          </Slider>
          <Slider
            w={`${100 * (100 / 144)}%`}
            ml={`${400 / 144}%`}
            isReversed
            min={0}
            max={1}
            step={0.01}
            value={1 - integrationTime}
            onChange={(value) => infomapStore.setIntegrationTime(1 - value)}
            onChangeEnd={(value) => {
              infomapStore.setIntegrationTime(1 - value, true);
              infomapStore.run();
            }}
            colorScheme="blue"
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb />
          </Slider>
        </Box>
      </Box>

      <VStack mt={4} maxW={350} align="start">
        {showDeveloperStuff && (
          <>
            <FormControl display="flex" w="100%" alignItems="center">
              <FormLabel htmlFor="curveBundleBeta" mb="0">
                Curve bundle strength
              </FormLabel>
              <Spacer />
              <Slider
                id="curveBundleBeta"
                w="30%"
                isDisabled={infomapStore.integrationTime === 1}
                focusThumbOnChange={false}
                value={beta}
                onChange={setBeta}
                min={0}
                max={1}
                step={0.01}
              >
                <SliderTrack>
                  <SliderFilledTrack />
                </SliderTrack>
                <SliderThumb fontSize="sm" boxSize="16px"></SliderThumb>
              </Slider>
              <Tag size="sm" ml={4}>
                {beta}
              </Tag>
            </FormControl>
          </>
        )}
        <FormControl display="flex" w="100%" alignItems="center">
          <FormLabel htmlFor="treeWeightBalance" mb="0">
            Relative tree strength
          </FormLabel>
          <Spacer />
          <Slider
            id="treeWeightBalance"
            w="30%"
            isDisabled={!infomapStore.includeTreeInNetwork}
            focusThumbOnChange={false}
            value={infomapStore.treeWeightBalance}
            onChange={(value) => infomapStore.setTreeWeightBalance(value)}
            onChangeEnd={(value) => {
              infomapStore.setTreeWeightBalance(value, true);
              infomapStore.run();
            }}
            min={0}
            max={1}
            step={0.01}
          >
            <SliderTrack>
              <SliderFilledTrack />
            </SliderTrack>
            <SliderThumb fontSize="sm" boxSize="16px"></SliderThumb>
          </Slider>
          <Tag size="sm" ml={4}>
            {format('.0%')(infomapStore.treeWeightBalance)}
          </Tag>
        </FormControl>
        <VStack w="100%" align="stretch" spacing={2}>
          <VStack w="100%" align="stretch">
            <Stat label="Nodes">{numNodes}</Stat>
            <Stat label="Links">{numLinks}</Stat>
            <Stat label="Tree nodes">{numNodesFromTree}</Stat>
            <Stat label="Tree links">{numLinksFromTree}</Stat>
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
        <FormControl display="flex" w="100%" alignItems="center">
          <FormLabel htmlFor="uniformTreeLinks" mb="0">
            Uniform tree links
          </FormLabel>
          <Spacer />
          <Switch
            id="uniformTreeLinks"
            isChecked={infomapStore.uniformTreeLinks}
            onChange={() => {
              infomapStore.setUniformTreeLinks(
                !infomapStore.uniformTreeLinks,
                true,
              );
              infomapStore.run();
            }}
          />
        </FormControl>
      </VStack>
    </Box>
  );
});