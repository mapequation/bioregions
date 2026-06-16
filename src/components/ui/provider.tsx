'use client';

import { ChakraProvider, defaultSystem, type SystemContext } from '@chakra-ui/react';
import { ColorModeProvider, type ColorModeProviderProps } from './color-mode';

interface ProviderProps extends ColorModeProviderProps {
  system?: SystemContext;
}

export function Provider(props: ProviderProps) {
  return (
    <ChakraProvider value={props.system ?? defaultSystem}>
      <ColorModeProvider {...props} />
    </ChakraProvider>
  );
}
