import { useEffect, useRef, useState } from 'react';
import { Camera, LogOut, User } from 'lucide-react';
import { formatWeight } from '../lib/format';
import { fitnessApi } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { avatarUrl, uploadAvatar } from '../lib/avatar';

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

// Server fields as edited by the form; birth_year is kept as a string here
// so an empty input can be distinguished from a real year.
const fieldsFromProfile = (profile) => ({
  displayName: profile?.display_name || '',
  phone: profile?.phone || '',
  birthYear: profile?.birth_year != null ? String(profile.birth_year) : '',
});

function MeTab({ workoutHistory, autoCamera, setAutoCamera }) {
  const { user, signOut } = useAuth();
  const bests = personalBests(workoutHistory);
  const totalRepsSum = workoutHistory.reduce((a, log) => a + totalReps(log), 0);

  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const [avatarPath, setAvatarPath] = useState(null);
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [avatarError, setAvatarError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    fitnessApi.getProfile()
      .then((res) => {
        if (!active) return;
        const data = res.data?.data || {};
        setProfile(data);
        const fields = fieldsFromProfile(data);
        setDisplayName(fields.displayName);
        setPhone(fields.phone);
        setBirthYear(fields.birthYear);
        setAvatarPath(data.avatar_path || null);
      })
      .catch((err) => console.error('getProfile:', err))
      .finally(() => { if (active) setProfileLoaded(true); });
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

  const savedFields = fieldsFromProfile(profile);
  const isDirty = profileLoaded && (
    displayName !== savedFields.displayName ||
    phone !== savedFields.phone ||
    birthYear !== savedFields.birthYear
  );

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveStatus('');
    try {
      const res = await fitnessApi.updateProfile({
        display_name: displayName.trim() ? displayName.trim() : null,
        phone: phone.trim() ? phone.trim() : null,
        birth_year: birthYear.trim() ? parseInt(birthYear, 10) : null,
      });
      const data = res.data?.data || {};
      setProfile(data);
      const fields = fieldsFromProfile(data);
      setDisplayName(fields.displayName);
      setPhone(fields.phone);
      setBirthYear(fields.birthYear);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      console.error('updateProfile:', err);
      setSaveStatus('Error saving');
      setTimeout(() => setSaveStatus(''), 2000);
    } finally {
      setSaving(false);
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

      <div className="row">
        <div>
          <div className="row-title">Email</div>
          <div className="row-sub">{user.email}</div>
        </div>
      </div>
      <p className="dim field-note">Your email can&rsquo;t be changed here.</p>

      <div className="card">
        <div className="avatar-row">
          {avatarSrc ? (
            <img src={avatarSrc} alt="Your avatar" className="avatar" />
          ) : (
            <div className="avatar-placeholder">
              <User size={28} strokeWidth={1.5} />
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
          >
            {uploadingAvatar ? 'Uploading…' : 'Change photo'}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="sr-only"
          />
        </div>
        {avatarError && <p className="dim field-note">{avatarError}</p>}

        <div className="input-group">
          <label className="label" htmlFor="me-display-name">Display name</label>
          <input
            id="me-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Add a display name"
          />
        </div>

        <div className="input-group">
          <label className="label" htmlFor="me-phone">Phone</label>
          <input
            id="me-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Add a phone number"
          />
        </div>

        <div className="input-group">
          <label className="label" htmlFor="me-birth-year">Birth year</label>
          <input
            id="me-birth-year"
            type="number"
            min="1900"
            max="2100"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            placeholder="Add a birth year"
          />
        </div>

        <button
          className="btn btn-accent btn-block"
          onClick={handleSaveProfile}
          disabled={saving || !isDirty}
        >
          {saving ? 'Saving…' : (saveStatus || 'Save')}
        </button>
      </div>

      <button className="btn btn-secondary btn-block" onClick={signOut}>
        <LogOut size={18} strokeWidth={1.5} />
        Sign out
      </button>
    </div>
  );
}

export default MeTab;
