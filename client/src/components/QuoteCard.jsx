import { formatCurrency, formatSigned } from '../format.js';

export function QuoteCard({ quote, onRemove }) {
  const isUp = quote.change >= 0;
  return (
    <a className="quote-card" href={`#/stock/${quote.symbol}`}>
      <div className="quote-card-top">
        <div>
          <span className="quote-symbol">{quote.symbol}</span>
          <span className="quote-name">{quote.name}</span>
        </div>
        {onRemove && (
          <button
            className="remove-btn"
            title={`Remove ${quote.symbol} from watchlist`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove(quote.symbol);
            }}
          >
            ×
          </button>
        )}
      </div>
      <div className="quote-price">{formatCurrency(quote.price)}</div>
      <div className={`quote-change ${isUp ? 'up' : 'down'}`}>
        {formatSigned(quote.change)} ({formatSigned(quote.changePercent, { percent: true })})
      </div>
    </a>
  );
}
