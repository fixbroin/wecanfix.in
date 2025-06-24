"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Minus } from 'lucide-react';

interface QuantitySelectorProps {
  initialQuantity?: number;
  minQuantity?: number;
  maxQuantity?: number;
  onQuantityChange: (quantity: number) => void;
  className?: string;
}

const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  initialQuantity = 1,
  minQuantity = 0,
  maxQuantity = 99,
  onQuantityChange,
  className = '',
}) => {
  const [quantity, setQuantity] = useState(initialQuantity);

  useEffect(() => {
    setQuantity(initialQuantity);
  }, [initialQuantity]);

  const handleIncrement = () => {
    const newQuantity = Math.min(quantity + 1, maxQuantity);
    setQuantity(newQuantity);
    onQuantityChange(newQuantity);
  };

  const handleDecrement = () => {
    const newQuantity = Math.max(quantity - 1, minQuantity);
    setQuantity(newQuantity);
    onQuantityChange(newQuantity);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseInt(event.target.value, 10);
    if (isNaN(value)) {
      value = minQuantity;
    }
    value = Math.max(minQuantity, Math.min(value, maxQuantity));
    setQuantity(value);
    onQuantityChange(value);
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handleDecrement}
        disabled={quantity <= minQuantity}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        className="h-8 w-12 text-center px-1"
        value={quantity}
        onChange={handleChange}
        min={minQuantity}
        max={maxQuantity}
        aria-label="Quantity"
      />
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handleIncrement}
        disabled={quantity >= maxQuantity}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default QuantitySelector;
