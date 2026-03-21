
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Minus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast'; // Import useToast

interface QuantitySelectorProps {
  initialQuantity?: number;
  minQuantity?: number;
  enforcedMinQuantity?: number; // New prop
  maxQuantity?: number;
  onQuantityChange: (quantity: number) => void;
  className?: string;
}

const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  initialQuantity = 1,
  minQuantity = 0,
  enforcedMinQuantity = 0,
  maxQuantity = 99,
  onQuantityChange,
  className = '',
}) => {
  const [quantity, setQuantity] = useState(initialQuantity);
  const { toast } = useToast();

  useEffect(() => {
    setQuantity(initialQuantity);
  }, [initialQuantity]);

  const handleIncrement = () => {
    if (quantity >= maxQuantity) {
      toast({
        title: "Maximum Quantity Reached",
        description: `You can only add up to ${maxQuantity} units for this service.`,
        variant: "default",
      });
      return;
    }
    
    // If current is 0 and there's an enforced min, jump to it
    let newQuantity = quantity + 1;
    if (quantity === 0 && enforcedMinQuantity > 0) {
      newQuantity = enforcedMinQuantity;
    }
    
    setQuantity(newQuantity);
    onQuantityChange(newQuantity);
  };

  const handleDecrement = () => {
    let newQuantity = quantity - 1;
    
    // Logic: If current quantity is equal to enforcedMinQuantity, next step is 0
    if (enforcedMinQuantity > 0 && quantity <= enforcedMinQuantity) {
      newQuantity = 0;
    }
    
    newQuantity = Math.max(newQuantity, minQuantity);
    setQuantity(newQuantity);
    onQuantityChange(newQuantity);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseInt(event.target.value, 10);
    if (isNaN(value)) {
      value = minQuantity;
    }
    
    if (value > maxQuantity) {
      value = maxQuantity;
      toast({
        title: "Maximum Quantity Exceeded",
        description: `You can only add up to ${maxQuantity} units.`,
        variant: "default",
      });
    }

    if (value > 0 && enforcedMinQuantity > 0 && value < enforcedMinQuantity) {
        value = enforcedMinQuantity;
    }

    value = Math.max(minQuantity, value);
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
        disabled={quantity === 0}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        className="h-8 w-12 text-center px-1"
        value={quantity}
        onChange={handleChange}
        onBlur={(e) => { // Handles case where user leaves the input empty
            if(e.target.value === '') {
                const newQuantity = minQuantity > 0 ? minQuantity : 0;
                setQuantity(newQuantity);
                onQuantityChange(newQuantity);
            }
        }}
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
