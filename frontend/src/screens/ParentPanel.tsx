import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Header } from '../components/Header';
import { useSession } from '../session';
import { sortMembers, type Approvals as ApprovalsData, type Profile } from '../types';
import { Approvals } from './parent/Approvals';
import { Cards } from './parent/Cards';
import { Family } from './parent/Family';
import { Rewards } from './parent/Rewards';
import { TutorTab } from './parent/TutorTab';

type Tab = 'keuren' | 'kaarten' | 'beloningen' | 'hulp' | 'gezin';

export function ParentPanel() {
  const me = useSession()!.profile;
  const [tab, setTab] = useState<Tab>('keuren');
  const [approvals, setApprovals] = useState<ApprovalsData>({ cards: [], redemptions: [] });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    api.approvals().then(setApprovals).catch(() => undefined);
    api.profiles().then(setProfiles).catch(() => undefined);
    api.tutorStatus().then((s) => setUnread(s.unread)).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  const pending = approvals.cards.length + approvals.redemptions.length;
  const kids = sortMembers(profiles);

  return (
    <div className="screen">
      <Header profile={me} />
      <div className="tabs-bar">
        <button className={tab === 'keuren' ? 'on' : ''} onClick={() => { setTab('keuren'); load(); }}>✓ Keuren{pending > 0 && <span className="count">{pending}</span>}</button>
        <button className={tab === 'kaarten' ? 'on' : ''} onClick={() => setTab('kaarten')}>🗂️ Kaarten</button>
        <button className={tab === 'beloningen' ? 'on' : ''} onClick={() => setTab('beloningen')}>🛍️ Beloningen</button>
        <button className={tab === 'hulp' ? 'on' : ''} onClick={() => { setTab('hulp'); load(); }}>🦉 Huiswerkhulp{unread > 0 && <span className="count">{unread}</span>}</button>
        <button className={tab === 'gezin' ? 'on' : ''} onClick={() => setTab('gezin')}>👨‍👩‍👧‍👦 Gezin</button>
      </div>
      {tab === 'keuren' && <Approvals data={approvals} onChanged={load} />}
      {tab === 'kaarten' && <Cards kids={kids} />}
      {tab === 'beloningen' && <Rewards />}
      {tab === 'hulp' && <TutorTab kids={profiles.filter((p) => p.role === 'kid')} />}
      {tab === 'gezin' && <Family profiles={sortMembers(profiles)} onChanged={load} />}
    </div>
  );
}
