import { useEffect, useState, useRef, useCallback } from 'react';
import { clamp } from '../utils/math';

export const useMousePosition = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const setFromEvent = (e: MouseEvent) =>
      setPosition({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', setFromEvent);

    return () => {
      window.removeEventListener('mousemove', setFromEvent);
    };
  }, []);

  return position;
};

export type TangleInputProps = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  logScale?: boolean;
  speed?: number;
  format?: (value: number, step: number) => string;
  prefix?: string;
  suffix?: string;
  className?: string;
  onInput?: () => void;
  onChange?: (value: number) => void;
};

type RefState = {
  currentValue: number;
  startX?: number;
  lastX?: number;
  min?: number;
  max?: number;
};

/**
 * Get step size, adjusted if log scale to step through the series below:
 * -20, -10, -9, ..., -1, 0, 1, 2, 3, ..., 9, 10, 20, 30, ..., 90, 100, 200, ..., 1000, 2000, ...
 * @param value current value
 * @param step default step size
 * @param logScale if true, round step size to current order of magnitude
 * @param sign step direction, positive or negative
 * @returns step size, possibly adjusted if log scale
 */
const getStep = (
  value: number,
  step: number,
  logScale: boolean,
  sign: number,
) => {
  if (logScale) {
    return value === 0
      ? 1
      : Math.pow(
          10,
          Math.floor(
            Math.log10(
              Math.max(
                1,
                Math.abs(value) + (sign * Math.sign(value) < 0 ? -1 : 0),
              ),
            ),
          ),
        ) * step;
  }
  return step;
};

const stepRound = (step: number, value: number) =>
  Math.round(value / step) * step;

export default function TangleInput({
  value,
  min,
  max,
  step = 1,
  logScale = false,
  speed = 1, // steps per pixel change
  format = (value: number, step: number) =>
    step < 1
      ? value.toFixed(Math.ceil(-Math.log10(step))).toString()
      : value.toString(),
  prefix = '',
  suffix = '',
  className = '',
  onInput,
  onChange,
}: TangleInputProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const refState = useRef<RefState>({
    currentValue: value,
    min,
    max,
  });
  const [isPressed, setIsPressed] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const [currentStep, setCurrentStep] = useState(step);

  const onWindowMouseMove = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();

      const lastX = e.screenX;

      // const pixelChange = lastX - startX;
      const pixelChange = lastX - refState.current.lastX!;
      const numSteps =
        pixelChange > 0
          ? Math.floor(speed * pixelChange)
          : Math.ceil(speed * pixelChange);

      if (numSteps === 0) return;

      const { currentValue } = refState.current;
      let currentStep = getStep(currentValue, step, logScale, numSteps);

      let nextValue = currentValue + numSteps * currentStep;

      // Clamp to step-resolved bounds
      const { min, max } = refState.current;
      nextValue = clamp(nextValue, min, max);

      // console.log(
      //   `Pressed, startX: ${startX} (${
      //     refState.current.startX
      //   }), lastX: ${lastX}, pixel change: ${pixelChange}, numSteps: ${numSteps}, currentStep: ${currentStep}, nextValue: ${currentValue} + ${numSteps} * ${currentStep} = ${
      //     currentValue + numSteps * currentStep
      //   } (${nextValue}), min: ${min}, max: ${max}`,
      // );

      // Adjust current step size if log step
      if (logScale) {
        let nextStep = getStep(nextValue, step, logScale, numSteps);
        let oldLog = Math.floor(Math.log10(currentValue));
        let newLog = Math.floor(Math.log10(nextValue));

        if (newLog !== oldLog) {
          if (newLog < oldLog) {
            // Recalculate next value with smaller step size, so e.g. 200, 100, 0 -> 200, 100, 90, ...
            // nextStep = Math.pow(10, Math.floor(oldLog - 1)) * this.props.logScale;
            nextValue = currentValue + numSteps * nextStep;
            // Re-calculate new step size
            nextStep = getStep(nextValue, step, logScale, numSteps);
          }
          currentStep = nextStep;
          // Round to step resolution
          nextValue = stepRound(currentStep, nextValue);
          // Clamp to step-resolved bounds
          nextValue = clamp(nextValue, min, max);
        }
      }

      refState.current.lastX = lastX;
      refState.current.currentValue = nextValue;
      setCurrentValue(nextValue);
      setCurrentStep(currentStep);
    },
    [step, logScale, speed],
  );

  const onWindowMouseUp = useCallback(
    (e: MouseEvent) => {
      console.log('onMouseUp', refState.current.currentValue);
      e.preventDefault();
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      setIsPressed(false);
      if (onChange) {
        onChange(refState.current.currentValue);
      }
    },
    [onWindowMouseMove, onChange],
  );

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      const { screenX } = e;
      console.log('onMouseDown');
      e.preventDefault();
      e.stopImmediatePropagation();
      setIsPressed(true);
      setCurrentValue(value);
      refState.current.startX = refState.current.lastX = screenX;
      console.log('Mouse down at X:', screenX, 'value:', value);

      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      window.addEventListener('mousedown', onWindowMouseUp);
    },
    [onWindowMouseMove, onWindowMouseUp, value],
  );

  useEffect(() => {
    if (ref.current) {
      ref.current.addEventListener('mousedown', onMouseDown);
    }
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('mousedown', onWindowMouseUp);
      // if (ref.current != null) {
      //   ref.current.removeEventListener('mousedown', onMouseDown);
      // }
    };
  }, [onMouseDown, onWindowMouseMove, onWindowMouseUp]);
  // }, []);

  useEffect(() => {
    if (refState.current) {
      console.log(`useEffect(min: ${min}, max: ${max})`);
      refState.current.min = min;
      refState.current.max = max;
    }
  }, [min, max]);

  if (isPressed) {
  }

  const oldFormattedValue = format(value, currentStep);
  const currentFormattedValue = format(currentValue, currentStep);

  // isChanged compares the value between mouseDown and mouseUp
  const isChanged = currentFormattedValue !== oldFormattedValue;

  // const val = isPressed ? currentValue : value;
  // const currentStep = getStep(currentValue, step, logScale);

  return (
    <span
      ref={ref}
      style={{
        cursor: 'ew-resize',
        backgroundColor: isChanged ? 'rgb(255, 209, 209)' : '#E8E8E8',
        opacity: isPressed ? 0.8 : 1,
        padding: '3px 6px',
      }}
    >
      {prefix}
      {currentFormattedValue}
      {suffix}
    </span>
  );
}

// (value: {value}, startX: {startX}, lastX: {lastX}, currentValue:{' '}
// {currentValue}, currentStep: {currentStep}, isPressed:{' '}
// {isPressed ? '1' : '0'}, isChanged: {isChanged ? '1' : '0'})

// .tangle {
//   cursor: ew-resize;
// }

// .tangle.tangle-pressed {
//   opacity: 0.8;
// }

// .tangle.tangle-pressed.tangle-changed {
//   background-color: rgb(255, 209, 209);
// }
