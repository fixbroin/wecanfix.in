import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star } from 'lucide-react';
import { testimonials } from '@/data/mock';

const Testimonials = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {testimonials.map((testimonial) => (
        <Card key={testimonial.id} className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-3">
              <Avatar>
                {testimonial.avatarUrl && <AvatarImage src={testimonial.avatarUrl} alt={testimonial.name} data-ai-hint="person avatar" />}
                <AvatarFallback>{testimonial.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-md font-headline">{testimonial.name}</CardTitle>
                <div className="flex items-center mt-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < testimonial.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/50'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-sm text-muted-foreground italic">"{testimonial.text}"</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default Testimonials;
