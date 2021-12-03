import { observer } from 'mobx-react';
import { useStore } from '../../store';
import Bioregions from './Bioregions';

export default observer(function Statistics() {
  const { infomapStore } = useStore();
  if (infomapStore.numBioregions > 0) {
    return <Bioregions />;
  }
  return <div></div>;
});
