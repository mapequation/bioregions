import { useEffect, useLayoutEffect, useState } from 'react';

function WorldMap() {
  const [value, setValue] = useState(-1);

  useEffect(() => {
    setValue(2);
    console.log('useEffect sets value to 2');
  }, [value]);

  useLayoutEffect(() => {
    setValue(1);
    console.log('useLayoutEffect sets value to 1');
  }, [value]);

  return (
    <>
      <button
        onClick={() => {
          setValue(0);
          console.log('onClick sets value to 0');
        }}
      >
        Update Data
      </button>
      <div>{value}</div>
    </>
  );
}

export default WorldMap;
