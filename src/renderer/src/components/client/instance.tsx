import { Card, CardTitle, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface InstanceProps {
  name: string
  cover: string
  className?: string
}

export default function InstanceComponent({ name, cover, className }: InstanceProps): JSX.Element {
  return (
    <div className={className}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{name}</CardTitle>
          <Avatar className="h-8 w-8">
            <AvatarImage src={`${cover}`} alt={`${name}'s cover`} />
            <AvatarFallback>{name}</AvatarFallback>
          </Avatar>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          All my (lore friendly) vehicle mods in one place.
        </CardContent>
        <CardFooter>
          <Button className="w-full">Play</Button>
        </CardFooter>
      </Card>
    </div>
  )
}
