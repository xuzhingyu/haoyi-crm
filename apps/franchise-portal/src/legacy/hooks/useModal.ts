import { useOverlay } from '../../ui/useOverlay';

/** Compatibility adapter; focus remains constrained through the closing animation. */
export function useModal(onClose: () => void, open = true, dismissible = true) {
  return useOverlay<HTMLElement>(onClose, open, dismissible);
}
