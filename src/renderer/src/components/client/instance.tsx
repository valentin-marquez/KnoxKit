import { useEffect, useState } from 'react'
import { Card, CardTitle, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface InstanceProps {
  name: string
  cover: string
  className?: string
}

export default function InstanceComponent({ name, cover, className }: InstanceProps): JSX.Element {
  // get image from cover url and set local image
  const [image, setImage] = useState<string | null>(null)

  useEffect(() => {
    const loadImage = async (): Promise<void> => {
      const response = await fetch(cover)
      const blob = await response.blob()
      const imageUrl = URL.createObjectURL(blob)
      setImage(imageUrl)
    }

    loadImage()
  }, [cover])

  return (
    <div className={className}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{name}</CardTitle>
          <Avatar className="h-4 w-4">
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
