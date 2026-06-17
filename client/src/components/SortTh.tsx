interface Props {
  label: string;
  col: string;
  sortCol: string;
  sortDir: 'asc' | 'desc';
  onSort: (col: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function SortTh({ label, col, sortCol, sortDir, onSort, className, style }: Props) {
  const active = sortCol === col;
  return (
    <th
      className={className}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
      onClick={() => onSort(col)}
      title={`Sort by ${label}`}
    >
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, opacity: active ? 1 : 0.25 }}>
        {active && sortDir === 'desc' ? '▼' : '▲'}
      </span>
    </th>
  );
}
