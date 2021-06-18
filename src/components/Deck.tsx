import DeckGL from '@deck.gl/react';
import { observer } from 'mobx-react';
import store from '../store';
//@ts-ignore
import { _GlobeViewport as GlobeViewport } from '@deck.gl/core';
//@ts-ignore
import { _GlobeView as GlobeView } from 'deck.gl';

const viewport = new GlobeViewport({
  width: 600,
  height: 400,
  longitude: -50,
  latitude: 10,
  zoom: 0,
});

// const INITIAL_VIEW_STATE = {
//   longitude: 0,
//   latitude: 37.7853,
//   zoom: 1,
//   pitch: 0,
//   bearing: 0,
// };

const view = new GlobeView();

interface Props {
  width?: number;
  height?: number;
  layers?: any[];
}

export default observer(function Deck(props: Props) {
  const hasLayers = store.layers.length > 0;

  return (
    <>
      <div>
        DeckGL Store loaded: {store.landLoaded ? 'true' : 'false'} data loaded:{' '}
        {store.dataLoaded ? 'true' : 'false'}
      </div>
      {hasLayers && store.dataLoaded && (
        <DeckGL
          // initialViewState={INITIAL_VIEW_STATE}
          initialViewState={viewport}
          views={[view]}
          controller={true}
          width={props.width ?? 800}
          height={props.height ?? 800}
          onLoad={() => console.log('Deck GL loaded.')}
          onError={(err) => console.log('Error: ', err)}
          layers={store.layers}
        />
      )}
    </>
  );
});
