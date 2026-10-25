import { Route, Routes, useParams } from 'react-router-dom';
import { DatasetsPage } from './DatasetsPage';
import { DatasetDetailPage } from './DatasetDetailPage';
import './datasets.css';
// Mounted at /app/datasets/* by client/src/main.tsx.
export function DatasetsRoutes() {
  return <Routes><Route index element={<DatasetsPage/>}/><Route path=":datasetId" element={<DatasetDetail/>}/></Routes>;
}
// Keyed by ID so switching datasets starts from fresh state.
function DatasetDetail() { const { datasetId } = useParams(); return <DatasetDetailPage key={datasetId}/>; }
