import DeckGL from '@deck.gl/react';
import { observer } from 'mobx-react';
import store from '../store';
import {
  WebMercatorViewport,
  MapView,
  //@ts-ignore
  _GlobeViewport as GlobeViewport,
} from '@deck.gl/core';
//@ts-ignore
import { _GlobeView as GlobeView } from 'deck.gl';

const viewportGlobe = new GlobeViewport({
  width: 800,
  height: 800,
  longitude: -50,
  latitude: 10,
  zoom: 0,
});

const viewportMercator = new WebMercatorViewport({
  width: 800,
  height: 800,
  longitude: -50,
  latitude: 10,
  zoom: 1,
});

const globeView = new GlobeView({
  id: 'base-map-globe',
  controller: true,
});

const mapView = new MapView({
  id: 'base-map',
  controller: true,
});

interface Props {
  width?: number;
  height?: number;
  useGlobe?: boolean;
}

const defaultProps: Required<Props> = {
  width: 800,
  height: 800,
  useGlobe: true,
};

export default observer(function Deck(
  props: Props & React.ComponentProps<typeof DeckGL> = defaultProps,
) {
  const hasLayers = store.layers.length > 0;

  const { width, height, useGlobe, ...deckGlProps } = props;

  const viewport = useGlobe ? viewportGlobe : viewportMercator;
  const view = useGlobe ? globeView : mapView;

  return (
    <>
      <div>
        DeckGL Store loaded: {store.landLoaded ? 'true' : 'false'} data loaded:{' '}
        {store.dataLoaded ? 'true' : 'false'}
      </div>
      {hasLayers && store.dataLoaded && (
        <DeckGL
          initialViewState={viewport}
          views={[view]}
          controller={true}
          width={width}
          height={height}
          onLoad={() => console.log('Deck GL loaded.')}
          onError={(err) => console.log('Error: ', err)}
          layers={store.layers}
          {...deckGlProps}
        />
      )}
    </>
  );
});
