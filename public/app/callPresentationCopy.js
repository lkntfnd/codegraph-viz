import {
  IMPACT_OVERVIEW_LINK_LIMIT,
  impactOverviewActive,
} from './render.js';

export function callPresentationScope(options = {}) {
  const callLayout = ['impact-flow', 'radial-reach'].includes(options.layoutId);
  if (!callLayout) return null;

  const summarizedCount = (options.collapsedComponents || [])
    .reduce((total, component) => total + (component.hiddenMemberIds?.length || 0), 0);
  if (summarizedCount > 0) {
    return {
      text: `${summarizedCount.toLocaleString()} cycle members summarized`,
      label: `${summarizedCount.toLocaleString()} members of a large loaded call cycle are represented by one summary node; loaded counts remain exact`,
    };
  }

  const exactPath = options.selectedId != null
    && String(options.selectedId) !== String(options.focusId)
    && Boolean(options.hasExactPath);
  if (options.layoutId === 'radial-reach') {
    return exactPath ? {
      text: 'loaded path highlighted',
      label: 'Highlighting one exact loaded path between the selected symbol and focus; other loaded relations remain visible',
    } : null;
  }
  if (exactPath) {
    return {
      text: 'exact loaded path',
      label: 'Showing the exact loaded path between the selected symbol and the call-graph focus',
    };
  }

  const sampled = impactOverviewActive({
    zoom: options.zoom,
    totalLinkCount: options.totalLinkCount,
    limit: IMPACT_OVERVIEW_LINK_LIMIT,
  });
  return sampled ? {
    text: 'links sampled at fit',
    label: `Fitted overview samples up to ${IMPACT_OVERVIEW_LINK_LIMIT} representative direct links; selecting a symbol shows its exact loaded path; zoom in to show all loaded links`,
  } : null;
}
