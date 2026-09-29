import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { TrendingUp, ChevronLeft, ChevronRight, Trophy, Check, Minus, X, CalendarPlus, CalendarX } from 'lucide-react';
import { dayKey, groupByDay, monthGrid } from '../lib/workoutCalendar';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const MONTH_LABEL = (year, month) =>
  new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

// A glyph as well as a colour: red/green alone is unreadable for the most
// common form of colour-vision deficiency.
const STATE_GLYPH = {
  pb: Trophy,
  pass: Check,
  mixed: Minus,
  fail: X,
};

const STATE_LABEL = {
  pb: 'personal best',
  pass: 'passed',
  mixed: 'partly passed',
  fail: 'missed target',
};

function ProgressTab({
  workoutHistory, chartData, chartOptions, plannedDays = [], onTogglePlannedDay, loadFailed,
}) {
  const days = groupByDay(workoutHistory);

  // Open on the most recent training day rather than today, so arriving here
  // shows something real instead of an empty state.
  const mostRecent = workoutHistory.length > 0
    ? [...workoutHistory].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
    : null;
  const initial = mostRecent ? new Date(mostRecent.created_at) : new Date();

  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [selectedKey, setSelectedKey] = useState(dayKey(initial));

  const shiftMonth = (delta) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const cells = monthGrid(viewYear, viewMonth);
  const plannedSet = new Set(plannedDays);
  const todayKey = dayKey(new Date());
  const selectedDay = days.get(selectedKey) || null;

  return (
    <div>
      <h1 className="screen-heading">Progress</h1>

      {workoutHistory.length === 0 ? (
        <div className="empty">
          <TrendingUp size={32} strokeWidth={1.5} />
          <p>{loadFailed
            ? 'Your history could not be loaded.'
            : 'Complete a workout to see your progress here!'}</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="cal-head">
              <button
                type="button"
                className="icon-btn"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft size={18} strokeWidth={1.5} />
              </button>
              <div className="cal-title">{MONTH_LABEL(viewYear, viewMonth)}</div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                <ChevronRight size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="cal-grid" role="grid" aria-label="Workout calendar">
              {WEEKDAYS.map((d, i) => (
                <div key={`wd-${i}`} className="cal-weekday" aria-hidden="true">{d}</div>
              ))}

              {cells.map(({ date, key, inMonth }) => {
                const day = days.get(key);
                const Glyph = day ? STATE_GLYPH[day.state] : null;
                // An outcome colour beats the planned dash: once a day has
                // happened, what you did matters more than what you meant to.
                const isPlanned = plannedSet.has(key);
                const classes = [
                  'cal-day',
                  inMonth ? '' : 'cal-day-outside',
                  day ? `cal-day-${day.state}` : '',
                  !day && isPlanned ? 'cal-day-planned' : '',
                  key === todayKey ? 'cal-day-today' : '',
                  key === selectedKey ? 'cal-day-selected' : '',
                ].filter(Boolean).join(' ');

                const readable = date.toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long',
                });

                return (
                  <button
                    type="button"
                    key={key}
                    className={classes}
                    onClick={() => setSelectedKey(key)}
                    aria-pressed={key === selectedKey}
                    aria-label={
                      day ? `${readable}, ${STATE_LABEL[day.state]}`
                        : isPlanned ? `${readable}, workout planned`
                        : `${readable}, no workout`
                    }
                  >
                    <span className="cal-day-num">{date.getDate()}</span>
                    {Glyph && <Glyph size={11} strokeWidth={2.5} className="cal-day-glyph" />}
                  </button>
                );
              })}
            </div>

            <div className="cal-legend">
              <span className="cal-key cal-day-pb" /> PB
              <span className="cal-key cal-day-pass" /> Passed
              <span className="cal-key cal-day-mixed" /> Mixed
              <span className="cal-key cal-day-fail" /> Missed
              <span className="cal-key cal-day-planned" /> Planned
            </div>
          </div>

          <div className="section-heading">
            {new Date(selectedKey).toLocaleDateString('en-GB', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </div>

          <div className="card">
            <div className="card-row">
              <div>
                <div className="row-title">
                  {plannedSet.has(selectedKey) ? 'Workout planned' : 'No plan for this day'}
                </div>
                <div className="row-sub">
                  {selectedDay
                    ? 'Already trained on this day.'
                    : 'Mark the days you intend to train.'}
                </div>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${plannedSet.has(selectedKey) ? 'btn-secondary' : 'btn-accent'}`}
                onClick={() => onTogglePlannedDay?.(selectedKey)}
              >
                {plannedSet.has(selectedKey)
                  ? <><CalendarX size={16} strokeWidth={1.5} />Unplan</>
                  : <><CalendarPlus size={16} strokeWidth={1.5} />Plan</>}
              </button>
            </div>
          </div>

          {!selectedDay ? (
            <div className="card">
              <p className="dim">No workout on this day.</p>
            </div>
          ) : (
            selectedDay.logs.map((log) => {
              const reps = Array.isArray(log.actual_reps) ? log.actual_reps : [];
              const total = reps.reduce((a, b) => a + b, 0);
              return (
                <div key={log.id} className="row">
                  <div>
                    <div className="row-title">
                      {log.exercise_name}
                      {log.isPersonalBest && (
                        <span className="badge badge-pb cal-inline-badge">PB</span>
                      )}
                    </div>
                    <div className="row-sub">
                      <span className="tnum">{reps.join(' · ') || '—'}</span>
                      {' · '}
                      <span className="tnum">{total}</span> reps
                    </div>
                  </div>
                  <span className={`badge ${log.status === 'PASS' ? 'badge-pass' : 'badge-fail'}`}>
                    {log.status === 'PASS' ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              );
            })
          )}

          <div className="section-heading">Total Reps Over Time</div>
          <div className="card">
            <div className="chart-wrap">
              <Line options={chartOptions} data={chartData} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ProgressTab;
