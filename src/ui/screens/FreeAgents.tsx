import { PageHeader } from '../components/Card';
import { FreeAgency } from './Offseason';

export function FreeAgents() {
  return (
    <>
      <PageHeader title="Free Agents" subtitle="Unsigned players available now" />
      <FreeAgency />
    </>
  );
}
