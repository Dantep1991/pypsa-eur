import { useState, useMemo } from 'react';
import { useResultsData } from './useResultsData';
import { buildResultsPreview } from '../utils/resultsPreview';
const EMPTY_POINTS = Object.freeze([]);

/**
 * Custom hook for managing Results tab state
 */
export function useResultsState({ active = true } = {}) {
  // Results file state
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsTableExpanded, setResultsTableExpanded] = useState(false);
  const [selectedParquetFile, setSelectedParquetFile] = useState(null);
  const [resultsFilters, setResultsFilters] = useState({
    category_name: '',
    child_name: '',
    collection_name: '',
    sample_name: '',
    date_resolution: 'day', // Tick-label format only; never aggregates source observations.
  });

  // Store filter options from API (all unique values from entire file)
  const { resultsAnalysis, resultsData, resultsLoading, resultsError, resultsPagination,
    resultsFilterOptions, retryResults } = useResultsData({ active, fileId: selectedParquetFile,
    filters: resultsFilters, page: resultsPage });

  const [resultsChartGroup, setResultsChartGroup] = useState('');
  const resultsPreview = useMemo(() => buildResultsPreview(resultsData, resultsFilters),
    [resultsData, resultsFilters.category_name, resultsFilters.child_name, resultsFilters.collection_name, resultsFilters.sample_name]);
  const resultsActiveGroup = resultsPreview.groups.find(group => group.key === resultsChartGroup) || resultsPreview.groups[0];
  const resultsTimeSeries = resultsActiveGroup?.points || EMPTY_POINTS;
  const resultsUnitLabel = resultsActiveGroup?.unit || '';

  return {
    // Results data
    resultsAnalysis,
    resultsData,
    resultsLoading,
    resultsError,
    retryResults,
    resultsPage,
    setResultsPage,
    resultsPagination,
    resultsTableExpanded,
    setResultsTableExpanded,
    selectedParquetFile,
    setSelectedParquetFile,
    resultsFilters,
    setResultsFilters,
    resultsFilterOptions,

    // Computed
    resultsTimeSeries,
    resultsUnitLabel,
    resultsPreview,
    resultsActiveGroup,
    setResultsChartGroup,
  };
}
