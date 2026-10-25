import { Route, Routes } from 'react-router-dom';
import { DatasetsPage } from './DatasetsPage';
import { DatasetDetailPage } from './DatasetDetailPage';
import './datasets.css';
// Mounted at /app/datasets/* by client/src/main.tsx.
export function DatasetsRoutes() {
  return <Routes><Route index element={<DatasetsPage/>}/><Route path=":datasetId" element={<DatasetDetailPage/>}/></Routes>;
}
