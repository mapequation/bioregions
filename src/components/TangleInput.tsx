import { useEffect, useState, useRef, useCallback } from 'react';
import { Box, useColorModeValue } from '@chakra-ui/react';
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
  const bg = useColorModeValue('hsl(0, 0%, 90%)', 'hsl(0, 0%, 33%)');
  const bgChanged = useColorModeValue('hsl(0, 100%, 90%)', 'hsl(0, 20%, 33%)');

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
      e.preventDefault();
      e.stopImmediatePropagation();
      setIsPressed(true);
      setCurrentValue(value);
      refState.current.startX = refState.current.lastX = screenX;

      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
      //window.addEventListener('mousedown', onWindowMouseUp);
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
      //window.removeEventListener('mousedown', onWindowMouseUp);
    };
  }, [onMouseDown, onWindowMouseMove, onWindowMouseUp]);

  useEffect(() => {
    if (refState.current) {
      refState.current.min = min;
      refState.current.max = max;
    }
  }, [min, max]);

  const oldFormattedValue = format(value, currentStep);
  const currentFormattedValue = format(currentValue, currentStep);

  // isChanged compares the value between mouseDown and mouseUp
  const isChanged = currentFormattedValue !== oldFormattedValue;

  return (
    <span
      ref={ref}
      style={{
        cursor: 'ew-resize',
        backgroundColor: isChanged ? bgChanged : bg,
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
