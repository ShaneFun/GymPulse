import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronRight, LogOut, User } from 'lucide-react';
import { formatWeight } from '../lib/format';
import { fitnessApi } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { avatarUrl, uploadAvatar } from '../lib/avatar';
import FieldEditor from '../components/FieldEditor';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const totalReps = (log) => (log.actual_reps || []).reduce((a, b) => a + b, 0);

// Consecutive distinct calendar days ending today or yesterday.
const currentStreak = (history) => {
  const days = [...new Set(
    history.map(l => new Date(l.created_at).toDateString())
  )].map(d => new Date(d).getTime()).sort((a, b) => b - a);

  if (days.length === 0) return 0;

  const DAY = 86400000;
  const today = new Date(new Date().toDateString()).getTime();
  if (days[0] !== today && days[0] !== today - DAY) return 0;

  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i - 1] - days[i] === DAY) streak++;
    else break;
  }
  return streak;
};

const passRate = (history) => {
  if (history.length === 0) return 0;
  const passed = history.filter(l => l.status === 'PASS').length;
  return Math.round((passed / history.length) * 100);
};

// Heaviest weight logged per exercise.
const personalBests = (history) => {
  const best = {};
  for (const log of history) {
    const name = log.exercise_name;
    if (!name) continue;
    const w = log.actual_weight || 0;
    if (!(name in best) || w > best[name]) best[name] = w;
  }
  return Object.entries(best).sort((a, b) => b[1] - a[1]);
};

// Server fields as edited via FieldEditor; birth_year is kept as a string
// here so an empty input can be distinguished from a real year.
const fieldsFromProfile = (profile) => ({
  displayName: profile?.display_name || '',
  phone: profile?.phone || '',
  birthYear: profile?.birth_year != null ? String(profile.birth_year) : '',
});

// One entry per editable row: how to present it in FieldEditor, and how to
// turn its draft string back into a PUT /profile payload. Each save sends
// only its own key — the backend uses exclude_unset, so the other fields
// are left untouched.
const FIELDS = {
  displayName: {
    apiKey: 'display_name',
    label: 'Name',
    inputType: 'text',
    inputProps: { autoComplete: 'name', placeholder: 'Add your name' },
    toPayloadValue: (v) => (v.trim() ? v.trim() : null),
  },
  phone: {
    apiKey: 'phone',
    label: 'Phone',
    inputType: 'tel',
    inputProps: { autoComplete: 'tel', inputMode: 'tel', placeholder: 'Add a phone number' },
    toPayloadValue: (v) => (v.trim() ? v.trim() : null),
  },
  birthYear: {
    apiKey: 'birth_year',
    label: 'Year of birth',
    inputType: 'number',
    inputProps: { min: '1900', max: '2100', placeholder: 'Add your year of birth' },
    toPayloadValue: (v) => (v.trim() ? parseInt(v, 10) : null),
  },
};

function MeTab({ workoutHistory, autoCamera, setAutoCamera }) {
  const { user, signOut } = useAuth();
  const bests = personalBests(workoutHistory);
  const totalRepsSum = workoutHistory.reduce((a, log) => a + totalReps(log), 0);

  const [profile, setProfile] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [fieldSaving, setFieldSaving] = useState(false);

  const [avatarPath, setAvatarPath] = useState(null);
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [avatarError, setAvatarError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  const nameRowRef = useRef(null);
  const phoneRowRef = useRef(null);
  const birthYearRowRef = useRef(null);
  const rowRefs = { displayName: nameRowRef, phone: phoneRowRef, birthYear: birthYearRowRef };

  useEffect(() => {
    let active = true;
    fitnessApi.getProfile()
      .then((res) => {
        if (!active) return;
        const data = res.data?.data || {};
        setProfile(data);
        setAvatarPath(data.avatar_path || null);
      })
      .catch((err) => console.error('getProfile:', err));
    return () => { active = false; };
  }, []);

  // avatarUrl is async (it mints a signed URL), so it can't run during render.
  // It already resolves to null for a falsy path, so this covers both cases
  // via the .then() callback rather than a synchronous setState in the effect.
  useEffect(() => {
    let active = true;
    avatarUrl(avatarPath).then((url) => { if (active) setAvatarSrc(url); });
    return () => { active = false; };
  }, [avatarPath]);

  const closeFieldEditor = () => {
    const triggerRef = rowRefs[editingField];
    setEditingField(null);
    triggerRef?.current?.focus();
  };

  // Called by FieldEditor's onSave; a thrown/rejected error is caught there
  // and shown inline, so the editor stays open on failure instead of
  // closing silently.
  const handleFieldSave = async (nextValue) => {
    const field = FIELDS[editingField];
    if (!field) return;
    setFieldSaving(true);
    try {
      const res = await fitnessApi.updateProfile({ [field.apiKey]: field.toPayloadValue(nextValue) });
      const data = res.data?.data || {};
      setProfile(data);
      closeFieldEditor();
    } catch (err) {
      console.error('updateProfile:', err);
      throw err;
    } finally {
      setFieldSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after an error
    if (!file) return;

    setAvatarError('');
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Image must be under 2 MB.');
      return;
    }

    setUploadingAvatar(true);

    let path;
    try {
      path = await uploadAvatar(file, user.id);
    } catch (err) {
      console.error('uploadAvatar:', err);
      setAvatarError('Upload failed. Please try again.');
      setUploadingAvatar(false);
      return;
    }

    // The storage path is deterministic (userId/avatar.<ext>), so
    // re-uploading with the same extension leaves `path` identical to the
    // current avatarPath and the [avatarPath] effect below would not re-run.
    // Mint a fresh signed URL here and set it directly so the new image
    // shows immediately regardless of whether the path changed.
    try {
      const freshUrl = await avatarUrl(path);
      setAvatarSrc(freshUrl);
      setAvatarPath(path);
      await fitnessApi.updateProfile({ avatar_path: path });
      setProfile((p) => ({ ...(p || {}), avatar_path: path }));
    } catch (err) {
      console.error('updateProfile:', err);
      setAvatarError('Photo uploaded, but saving your profile failed. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const editingConfig = editingField ? FIELDS[editingField] : null;

  return (
    <div>
      <h1 className="screen-heading">Me</h1>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-value">{workoutHistory.length}</div>
          <div className="stat-tile-label">Workouts</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{currentStreak(workoutHistory)}</div>
          <div className="stat-tile-label">Day Streak</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{passRate(workoutHistory)}%</div>
          <div className="stat-tile-label">Pass Rate</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-value">{totalRepsSum}</div>
          <div className="stat-tile-label">Total Reps</div>
        </div>
      </div>

      {bests.length > 0 && (
        <>
          <div className="section-heading">Personal Bests</div>
          {bests.map(([name, weight]) => (
            <div key={name} className="row">
              <span className="row-title">{name}</span>
              <span className="row-title tnum">{formatWeight(weight)} kg</span>
            </div>
          ))}
        </>
      )}

      <div className="section-heading">Settings</div>
      <div className="card">
        <div className="card-row">
          <div>
            <div className="row-title">Auto-start camera</div>
            <div className="row-sub">Begin tracking as soon as a set starts</div>
          </div>
          <button
            className={`btn btn-sm ${autoCamera ? 'btn-accent' : 'btn-secondary'}`}
            onClick={() => setAutoCamera(!autoCamera)}
          >
            <Camera size={16} strokeWidth={1.5} />
            {autoCamera ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="section-heading">Account</div>

      <button
        type="button"
        className="row"
        onClick={() => avatarInputRef.current?.click()}
        disabled={uploadingAvatar}
      >
        <div className="avatar-row">
          {avatarSrc ? (
            <img src={avatarSrc} alt="Your avatar" className="avatar" />
          ) : (
            <div className="avatar-placeholder">
              <User size={28} strokeWidth={1.5} />
            </div>
          )}
          <div>
            <div className="row-title">Photo</div>
            <div className="row-sub">{uploadingAvatar ? 'Uploading…' : 'Tap to change'}</div>
          </div>
        </div>
        <ChevronRight className="dim" size={20} strokeWidth={1.5} />
      </button>
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarChange}
        className="sr-only"
      />
      {avatarError && <p className="dim field-note">{avatarError}</p>}

      <button type="button" className="row" onClick={() => setEditingField('displayName')} ref={nameRowRef}>
        <div>
          <div className="row-title">Name</div>
          <div className="row-sub">{profile?.display_name || 'Add your name'}</div>
        </div>
        <ChevronRight className="dim" size={20} strokeWidth={1.5} />
      </button>

      <div className="row">
        <div>
          <div className="row-title">Email</div>
          <div className="row-sub">{user.email}</div>
        </div>
      </div>
      <p className="dim field-note">Your email can&rsquo;t be changed here.</p>

      <button type="button" className="row" onClick={() => setEditingField('phone')} ref={phoneRowRef}>
        <div>
          <div className="row-title">Phone</div>
          <div className="row-sub">{profile?.phone || 'Add a phone number'}</div>
        </div>
        <ChevronRight className="dim" size={20} strokeWidth={1.5} />
      </button>

      <button type="button" className="row" onClick={() => setEditingField('birthYear')} ref={birthYearRowRef}>
        <div>
          <div className="row-title">Year of birth</div>
          <div className="row-sub">
            {profile?.birth_year != null ? String(profile.birth_year) : 'Add your year of birth'}
          </div>
        </div>
        <ChevronRight className="dim" size={20} strokeWidth={1.5} />
      </button>

      <button className="btn btn-secondary btn-block" onClick={signOut}>
        <LogOut size={18} strokeWidth={1.5} />
        Sign out
      </button>

      {editingConfig && (
        <FieldEditor
          label={editingConfig.label}
          value={fieldsFromProfile(profile)[editingField]}
          inputType={editingConfig.inputType}
          inputProps={editingConfig.inputProps}
          onSave={handleFieldSave}
          onClose={closeFieldEditor}
          saving={fieldSaving}
        />
      )}
    </div>
  );
}

export default MeTab;
