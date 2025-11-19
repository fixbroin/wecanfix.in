import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { whyChooseUsItems } from '@/data/mock';

const WhyChooseUs = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {whyChooseUsItems.map((item) => {
        const IconComponent = item.icon;
        return (
          <Card key={item.id} className="text-center shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-col items-center">
              <div className="p-3 bg-accent/10 rounded-full mb-3">
                <IconComponent className="h-8 w-8 text-accent" />
              </div>
              <CardTitle className="text-lg font-headline text-foreground">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default WhyChooseUs;
